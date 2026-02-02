import * as readline from "readline";
import { ProxyConfig } from "./types.js";
import { MessageQueue } from "./message-queue.js";
import { AgentSession } from "./agent-session.js";

export class AgentProxy {
  private config: ProxyConfig;
  private messageQueue: MessageQueue;
  private agents: Map<string, AgentSession> = new Map();
  private running = false;
  private agentWakeups: Map<string, { resolve: () => void } | null> = new Map();
  private rl: readline.Interface | null = null;
  private signedOffAgents: Set<string> = new Set();
  private paused = false;
  private pauseResolvers: Map<string, () => void> = new Map();

  constructor(config: ProxyConfig) {
    this.config = config;
    this.messageQueue = new MessageQueue();

    for (const agentConfig of config.agents) {
      const session = new AgentSession(
        agentConfig,
        this.messageQueue,
        config.workingDirectory || process.cwd()
      );
      this.agents.set(agentConfig.id, session);

      // Register sign-off callback for each agent
      session.setSignOffCallback((agentId: string) => {
        this.handleSignOff(agentId);
      });
    }

    console.log(`[Proxy] Initialized with ${this.agents.size} agents`);
  }

  private handleSignOff(agentId: string): void {
    this.signedOffAgents.add(agentId);
    console.log(`[Proxy] ${agentId} signed off (${this.signedOffAgents.size}/${this.agents.size})`);

    if (this.signedOffAgents.size === this.agents.size) {
      this.handleAllSignedOff();
    }
  }

  private handleAllSignedOff(): void {
    console.log("[Proxy] All agents signed off - waiting for direction");
    this.signedOffAgents.clear();
    this.paused = true;
    this.promptForFreshStartChoice();
  }

  private promptForFreshStartChoice(): void {
    if (!this.rl) return;

    this.rl.question(
      "\n[All agents signed off] Enter direction, or type 'fresh' for fresh start: ",
      (input) => {
        if (input.toLowerCase() === "q") {
          this.stop();
          return;
        }

        const isFreshStart = input.toLowerCase() === "fresh";

        if (isFreshStart) {
          console.log("[Proxy] Fresh start - resetting all agent contexts");
          for (const agent of this.agents.values()) {
            agent.resetContext();
          }
          // Re-prompt for actual direction
          this.rl?.question(
            "\n[Direction] Enter guidance for fresh start: ",
            (direction) => {
              if (direction.toLowerCase() === "q") {
                this.stop();
                return;
              }
              if (direction.trim()) {
                this.unpause();
                this.publishToChannel(
                  "human-director",
                  "#planning",
                  `[DIRECTION FROM HUMAN OVERSEER]: ${direction}`
                );
              }
              this.resumeDirectionInput();
            }
          );
        } else if (input.trim()) {
          // Continue with existing context
          console.log("[Proxy] Continuing with existing context");
          this.unpause();
          this.publishToChannel(
            "human-director",
            "#planning",
            `[FEEDBACK FROM HUMAN OVERSEER]: ${input}`
          );
          this.resumeDirectionInput();
        } else {
          // Empty input, re-prompt
          this.promptForFreshStartChoice();
        }
      }
    );
  }

  private resumeDirectionInput(): void {
    this.startDirectionInputLoop();
  }

  private startDirectionInputLoop(): void {
    const promptForDirection = () => {
      if (!this.running || !this.rl) return;

      this.rl.question(
        "\n[Direction] Enter guidance (or 'q' to quit): ",
        (input) => {
          if (input.toLowerCase() === "q") {
            this.stop();
            return;
          }

          if (input.trim()) {
            // Clear any partial sign-offs when new direction is given
            this.signedOffAgents.clear();

            // Unpause if paused
            if (this.paused) {
              console.log("[Proxy] New direction received - resuming agents");
              this.unpause();
            }

            // Broadcast direction to all agents via #planning channel
            this.publishToChannel(
              "human-director",
              "#planning",
              `[DIRECTION FROM HUMAN OVERSEER]: ${input}`
            );
          }

          promptForDirection();
        }
      );
    };

    promptForDirection();
  }

  private waitForUnpause(agentId: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.paused) {
        resolve();
        return;
      }
      this.pauseResolvers.set(agentId, resolve);
    });
  }

  private unpause(): void {
    this.paused = false;
    for (const resolver of this.pauseResolvers.values()) {
      resolver();
    }
    this.pauseResolvers.clear();
  }

  async sendInitialPrompt(agentId: string, prompt: string): Promise<string> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    return agent.processMessages(prompt);
  }

  async injectMessage(
    from: string,
    to: string,
    content: string
  ): Promise<void> {
    this.messageQueue.send(from, to, content);
  }

  async broadcastMessage(from: string, content: string): Promise<void> {
    this.messageQueue.broadcast(from, content);
  }

  private waitForMessages(agentId: string): Promise<void> {
    return new Promise((resolve) => {
      // If already has messages, resolve immediately
      if (this.messageQueue.hasMessages(agentId)) {
        resolve();
        return;
      }
      // Otherwise wait for wakeup
      this.agentWakeups.set(agentId, { resolve });
    });
  }

  private async runAgentLoop(agentId: string, agent: AgentSession): Promise<void> {
    while (this.running) {
      // Wait if system is paused
      if (this.paused) {
        await this.waitForUnpause(agentId);
        if (!this.running) break;
      }

      await this.waitForMessages(agentId);
      if (!this.running) break;

      if (!agent.isProcessing && agent.hasIncomingMessages()) {
        try {
          const result = await agent.processMessages();
          console.log(`[Proxy] ${agentId}: ${result.substring(0, 100)}...`);
        } catch (err) {
          console.error(`[Proxy] ${agentId}: error`, (err as Error).message);
        }
      }
    }
  }

  private startDirectionInput(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.startDirectionInputLoop();
  }

  async runLoop(): Promise<void> {
    this.running = true;

    console.log(`[Proxy] Starting event-driven loop`);

    // Register wakeup callbacks
    for (const agentId of this.agents.keys()) {
      this.messageQueue.registerWakeup(agentId, () => {
        const pending = this.agentWakeups.get(agentId);
        if (pending) {
          pending.resolve();
          this.agentWakeups.set(agentId, null);
        }
      });
    }

    // Start direction input listener
    this.startDirectionInput();

    // Run all agent loops concurrently
    const agentLoops = Array.from(this.agents.entries()).map(([id, agent]) =>
      this.runAgentLoop(id, agent)
    );

    await Promise.all(agentLoops);
  }

  stop(): void {
    this.running = false;
    console.log("[Proxy] Stopping...");

    // Close readline interface
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    // Resolve pause resolvers to allow clean exit
    for (const resolver of this.pauseResolvers.values()) {
      resolver();
    }
    this.pauseResolvers.clear();

    // Wake up all waiting agents so they can exit
    for (const agentId of this.agents.keys()) {
      const pending = this.agentWakeups.get(agentId);
      if (pending) {
        pending.resolve();
      }
      this.messageQueue.unregisterWakeup(agentId);
    }
  }

  getAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }

  // Channel management convenience methods
  subscribeAgentToChannel(agentId: string, channel: string): boolean {
    return this.messageQueue.subscribe(agentId, channel);
  }

  unsubscribeAgentFromChannel(agentId: string, channel: string): boolean {
    return this.messageQueue.unsubscribe(agentId, channel);
  }

  publishToChannel(from: string, channel: string, content: string): void {
    this.messageQueue.publishToChannel(from, channel, content);
  }

  getChannels(): Array<{ name: string; subscriberCount: number }> {
    return this.messageQueue.getChannels();
  }

  getAgentSubscriptions(agentId: string): string[] {
    return this.messageQueue.getAgentSubscriptions(agentId);
  }
}
