export interface Message {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: number;
  replyTo?: string;
  channel?: string;
}

// Channel helper functions
export function isChannel(target: string): boolean {
  return target.startsWith("#");
}

export function normalizeChannelName(name: string): string {
  // Remove # prefix if present, lowercase, remove spaces
  return name.replace(/^#/, "").toLowerCase().replace(/\s+/g, "-");
}

export function getChannelId(name: string): string {
  return `#${normalizeChannelName(name)}`;
}

// Valid tool names for agent permissions
export type ToolName = "Read" | "Edit" | "Write" | "Bash" | "Glob" | "Grep";

export interface AgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  model?: "sonnet" | "opus" | "haiku";
  tools?: ToolName[]; // Optional: code tools this agent can access (defaults to none)
}

export interface AgentState {
  id: string;
  name: string;
  sessionId?: string;
  pendingMessages: Message[];
  isProcessing: boolean;
  lastActivity: number;
}

export interface ProxyConfig {
  agents: AgentConfig[];
  tickIntervalMs?: number;
  workingDirectory?: string;
}
