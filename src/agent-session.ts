import { query, createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { AgentConfig, AgentState, Message } from "./types.js";
import { MessageQueue } from "./message-queue.js";

export class AgentSession {
  private config: AgentConfig;
  private state: AgentState;
  private messageQueue: MessageQueue;
  private workingDirectory: string;

  constructor(
    config: AgentConfig,
    messageQueue: MessageQueue,
    workingDirectory: string
  ) {
    this.config = config;
    this.messageQueue = messageQueue;
    this.workingDirectory = workingDirectory;
    this.state = {
      id: config.id,
      name: config.name,
      pendingMessages: [],
      isProcessing: false,
      lastActivity: Date.now(),
    };

    messageQueue.createQueue(config.id);
  }

  get id(): string {
    return this.config.id;
  }

  get isProcessing(): boolean {
    return this.state.isProcessing;
  }

  hasIncomingMessages(): boolean {
    return this.messageQueue.hasMessages(this.config.id);
  }

  private createMessagingServer() {
    const agentId = this.config.id;
    const queue = this.messageQueue;

    const sendMessageTool = tool(
      "send_message",
      "Send a message to another agent in the network",
      {
        to: z.string().describe("Agent ID to send message to"),
        content: z.string().describe("Message content"),
        reply_to: z.string().optional().describe("Message ID if replying"),
      },
      async ({ to, content, reply_to }) => {
        const msg = queue.send(agentId, to, content, reply_to);
        return {
          content: [
            {
              type: "text" as const,
              text: `Message sent to ${to} (id: ${msg.id})`,
            },
          ],
        };
      }
    );

    const broadcastTool = tool(
      "broadcast",
      "Send a message to all agents in the network",
      {
        content: z.string().describe("Message content to broadcast"),
      },
      async ({ content }) => {
        const msgs = queue.broadcast(agentId, content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Broadcast sent to ${msgs.length} agents`,
            },
          ],
        };
      }
    );

    const listAgentsTool = tool(
      "list_agents",
      "List all agents in the network",
      {},
      async () => {
        const agents = queue.getAgentIds().filter((id) => id !== agentId);
        return {
          content: [
            {
              type: "text" as const,
              text: `Available agents: ${agents.join(", ")}`,
            },
          ],
        };
      }
    );

    const subscribeTool = tool(
      "subscribe",
      "Subscribe to a channel to receive messages published to it. Creates the channel if it doesn't exist.",
      {
        channel: z
          .string()
          .describe("Channel name (with or without # prefix, e.g., 'planning' or '#planning')"),
      },
      async ({ channel }) => {
        const subscribed = queue.subscribe(agentId, channel);
        const channelId = channel.startsWith("#") ? channel : `#${channel}`;
        return {
          content: [
            {
              type: "text" as const,
              text: subscribed
                ? `Subscribed to ${channelId}`
                : `Already subscribed to ${channelId}`,
            },
          ],
        };
      }
    );

    const unsubscribeTool = tool(
      "unsubscribe",
      "Unsubscribe from a channel to stop receiving its messages",
      {
        channel: z
          .string()
          .describe("Channel name (with or without # prefix)"),
      },
      async ({ channel }) => {
        const unsubscribed = queue.unsubscribe(agentId, channel);
        const channelId = channel.startsWith("#") ? channel : `#${channel}`;
        return {
          content: [
            {
              type: "text" as const,
              text: unsubscribed
                ? `Unsubscribed from ${channelId}`
                : `Was not subscribed to ${channelId}`,
            },
          ],
        };
      }
    );

    const publishTool = tool(
      "publish",
      "Publish a message to a channel. All subscribers (except you) will receive it.",
      {
        channel: z
          .string()
          .describe("Channel name (with or without # prefix)"),
        content: z.string().describe("Message content to publish"),
        reply_to: z.string().optional().describe("Message ID if replying"),
      },
      async ({ channel, content, reply_to }) => {
        const msg = queue.publishToChannel(agentId, channel, content, reply_to);
        const channelId = channel.startsWith("#") ? channel : `#${channel}`;
        return {
          content: [
            {
              type: "text" as const,
              text: `Published to ${channelId} (id: ${msg.id})`,
            },
          ],
        };
      }
    );

    const listChannelsTool = tool(
      "list_channels",
      "List all active channels and your subscriptions",
      {},
      async () => {
        const channels = queue.getChannels();
        const mySubscriptions = queue.getAgentSubscriptions(agentId);

        if (channels.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No active channels. Use subscribe to create and join a channel.",
              },
            ],
          };
        }

        const channelList = channels
          .map((ch) => {
            const subscribed = mySubscriptions.includes(ch.name) ? " (subscribed)" : "";
            return `${ch.name}: ${ch.subscriberCount} subscribers${subscribed}`;
          })
          .join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `Active channels:\n${channelList}`,
            },
          ],
        };
      }
    );

    return createSdkMcpServer({
      name: `messaging-${agentId}`,
      version: "1.0.0",
      tools: [
        sendMessageTool,
        broadcastTool,
        listAgentsTool,
        subscribeTool,
        unsubscribeTool,
        publishTool,
        listChannelsTool,
      ],
    });
  }

  private formatIncomingMessages(messages: Message[]): string {
    if (messages.length === 0) return "";

    const formatted = messages
      .map((m) => {
        if (m.channel) {
          return `[${m.from} in ${m.channel}]: ${m.content}`;
        }
        return `[${m.from}]: ${m.content}`;
      })
      .join("\n\n");

    return `\n--- INCOMING MESSAGES ---\n${formatted}\n--- END MESSAGES ---\n`;
  }

  async processMessages(initialPrompt?: string): Promise<string> {
    if (this.state.isProcessing) {
      return "Agent is busy processing";
    }

    this.state.isProcessing = true;
    this.state.lastActivity = Date.now();

    try {
      const incomingMessages = this.messageQueue.getMessages(this.config.id);
      const messagesText = this.formatIncomingMessages(incomingMessages);

      let prompt: string;
      if (initialPrompt) {
        prompt = initialPrompt + messagesText;
      } else if (incomingMessages.length > 0) {
        prompt = `You have received messages from other agents:${messagesText}\n\nRespond appropriately using the send_message tool.`;
      } else {
        return "No messages to process";
      }

      const messagingServer = this.createMessagingServer();

      const systemPrompt = `${this.config.systemPrompt}

You are agent "${this.config.id}" (${this.config.name}) in a multi-agent network.

Available tools for communication:
- send_message: Send a direct message to another agent
- broadcast: Send a message to all agents
- list_agents: See who else is in the network

Channel-based communication (pub/sub):
- subscribe: Join a channel (creates it if needed). Example: subscribe to "#planning"
- unsubscribe: Leave a channel
- publish: Send a message to all channel subscribers
- list_channels: See all active channels and your subscriptions

Channels are useful for topic-based discussions. Use #planning for proposals and discussions,
#implementation for code-related work. Subscribe before publishing.

When you receive messages, read them and respond appropriately.
Be collaborative and helpful to other agents.`;

      let responseText = "";
      let sessionId: string | undefined;

      // Messaging tools available to all agents
      const messagingTools = [
        "mcp__messaging__send_message",
        "mcp__messaging__broadcast",
        "mcp__messaging__list_agents",
        "mcp__messaging__subscribe",
        "mcp__messaging__unsubscribe",
        "mcp__messaging__publish",
        "mcp__messaging__list_channels",
      ];

      // Code tools from agent config (defaults to empty array if not specified)
      const codeTools = this.config.tools || [];

      const options: Parameters<typeof query>[0]["options"] = {
        model: this.config.model || "claude-sonnet-4-5-20250514",
        systemPrompt,
        cwd: this.workingDirectory,
        mcpServers: {
          messaging: messagingServer,
        },
        allowedTools: [...messagingTools, ...codeTools],
        permissionMode: "bypassPermissions" as const,
      };

      if (this.state.sessionId) {
        options.resume = this.state.sessionId;
      }

      const response = query({
        prompt,
        options,
      });

      for await (const message of response) {
        if (message.type === "system" && message.subtype === "init") {
          sessionId = message.session_id;
        }
        if (message.type === "assistant" && "content" in message) {
          if (typeof message.content === "string") {
            responseText += message.content;
          }
        }
      }

      if (sessionId) {
        this.state.sessionId = sessionId;
      }

      return responseText || "Processed";
    } catch (error) {
      console.error(`[${this.config.id}] Error:`, error);
      throw error;
    } finally {
      this.state.isProcessing = false;
    }
  }
}
