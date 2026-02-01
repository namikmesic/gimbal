import { Message, isChannel, getChannelId } from "./types.js";

interface Channel {
  name: string;
  subscribers: Set<string>;
  createdAt: number;
}

export class MessageQueue {
  private queues: Map<string, Message[]> = new Map();
  private channels: Map<string, Channel> = new Map();
  private messageCounter = 0;
  private wakeups: Map<string, () => void> = new Map();

  registerWakeup(agentId: string, callback: () => void): void {
    this.wakeups.set(agentId, callback);
  }

  unregisterWakeup(agentId: string): void {
    this.wakeups.delete(agentId);
  }

  private notifyAgent(agentId: string): void {
    const wakeup = this.wakeups.get(agentId);
    if (wakeup) wakeup();
  }

  createQueue(agentId: string): void {
    if (!this.queues.has(agentId)) {
      this.queues.set(agentId, []);
    }
  }

  send(from: string, to: string, content: string, replyTo?: string): Message {
    // Check if target is a channel
    if (isChannel(to)) {
      return this.publishToChannel(from, to, content, replyTo);
    }

    const message: Message = {
      id: `msg_${++this.messageCounter}`,
      from,
      to,
      content,
      timestamp: Date.now(),
      replyTo,
    };

    const queue = this.queues.get(to);
    if (queue) {
      queue.push(message);
      console.log(`\n${"─".repeat(60)}`);
      console.log(`[${from} -> ${to}]`);
      console.log(content);
      console.log(`${"─".repeat(60)}\n`);
      this.notifyAgent(to);
    } else {
      console.warn(`[Queue] Agent ${to} not found, message dropped`);
    }

    return message;
  }

  subscribe(agentId: string, channelName: string): boolean {
    const channelId = getChannelId(channelName);

    // Create channel if it doesn't exist
    if (!this.channels.has(channelId)) {
      this.channels.set(channelId, {
        name: channelId,
        subscribers: new Set(),
        createdAt: Date.now(),
      });
      console.log(`[Queue] Channel ${channelId} created`);
    }

    const channel = this.channels.get(channelId)!;
    if (channel.subscribers.has(agentId)) {
      return false; // Already subscribed
    }

    channel.subscribers.add(agentId);
    console.log(`[Queue] ${agentId} subscribed to ${channelId}`);
    return true;
  }

  unsubscribe(agentId: string, channelName: string): boolean {
    const channelId = getChannelId(channelName);
    const channel = this.channels.get(channelId);

    if (!channel || !channel.subscribers.has(agentId)) {
      return false;
    }

    channel.subscribers.delete(agentId);
    console.log(`[Queue] ${agentId} unsubscribed from ${channelId}`);

    // Remove empty channels
    if (channel.subscribers.size === 0) {
      this.channels.delete(channelId);
      console.log(`[Queue] Channel ${channelId} removed (no subscribers)`);
    }

    return true;
  }

  publishToChannel(
    from: string,
    channelName: string,
    content: string,
    replyTo?: string
  ): Message {
    const channelId = getChannelId(channelName);
    const channel = this.channels.get(channelId);

    const message: Message = {
      id: `msg_${++this.messageCounter}`,
      from,
      to: channelId,
      content,
      timestamp: Date.now(),
      replyTo,
      channel: channelId,
    };

    if (!channel) {
      console.warn(
        `[Queue] Channel ${channelId} not found, message dropped. Subscribe first.`
      );
      return message;
    }

    let deliveredCount = 0;
    for (const subscriberId of channel.subscribers) {
      // Don't deliver to sender
      if (subscriberId === from) continue;

      const queue = this.queues.get(subscriberId);
      if (queue) {
        queue.push({ ...message, to: subscriberId });
        deliveredCount++;
        this.notifyAgent(subscriberId);
      }
    }

    console.log(`\n${"─".repeat(60)}`);
    console.log(`[${from} -> ${channelId}] (${deliveredCount} recipients)`);
    console.log(content);
    console.log(`${"─".repeat(60)}\n`);

    return message;
  }

  getChannels(): Array<{ name: string; subscriberCount: number }> {
    return Array.from(this.channels.entries()).map(([name, channel]) => ({
      name,
      subscriberCount: channel.subscribers.size,
    }));
  }

  getAgentSubscriptions(agentId: string): string[] {
    const subscriptions: string[] = [];
    for (const [channelId, channel] of this.channels) {
      if (channel.subscribers.has(agentId)) {
        subscriptions.push(channelId);
      }
    }
    return subscriptions;
  }

  broadcast(from: string, content: string, excludeSelf = true): Message[] {
    const messages: Message[] = [];
    for (const agentId of this.queues.keys()) {
      if (excludeSelf && agentId === from) continue;
      messages.push(this.send(from, agentId, content));
    }
    return messages;
  }

  getMessages(agentId: string): Message[] {
    const queue = this.queues.get(agentId);
    if (!queue) return [];

    const messages = [...queue];
    queue.length = 0;
    return messages;
  }

  hasMessages(agentId: string): boolean {
    const queue = this.queues.get(agentId);
    return queue ? queue.length > 0 : false;
  }

  getAgentIds(): string[] {
    return Array.from(this.queues.keys());
  }
}
