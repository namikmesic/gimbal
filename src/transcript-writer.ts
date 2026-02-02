import * as fs from "fs";
import * as path from "path";
import { Message } from "./types.js";

/**
 * Writes agent conversations to a human-readable TRANSCRIPT.md file.
 * Only active when --store-transcripts flag is provided.
 */
export class TranscriptWriterImpl {
  private filePath: string;
  private enabled: boolean;
  private sessionStarted = false;

  constructor(workingDir: string, enabled: boolean) {
    this.enabled = enabled;
    this.filePath = path.join(workingDir, "TRANSCRIPT.md");
  }

  /**
   * Write session header to transcript file.
   * Called when the session starts.
   */
  startSession(direction?: string): void {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
    let header = `# Gimbal Session Transcript
**Started:** ${timestamp}
`;

    if (direction) {
      header += `**Direction:** ${direction}\n`;
    }

    header += `
---

## Messages

`;

    fs.writeFileSync(this.filePath, header);
    this.sessionStarted = true;
  }

  /**
   * Record a message to the transcript.
   * Appends formatted message to TRANSCRIPT.md.
   */
  recordMessage(msg: Message): void {
    if (!this.enabled) return;

    // Auto-start session if not started
    if (!this.sessionStarted) {
      this.startSession();
    }

    const time = new Date(msg.timestamp).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const target = msg.channel || msg.to;
    const entry = `### [${time}] ${msg.from} → ${target}
${msg.content}

---

`;

    fs.appendFileSync(this.filePath, entry);
  }

  /**
   * Write session footer with summary.
   * Called when the session ends.
   */
  endSession(): void {
    if (!this.enabled || !this.sessionStarted) return;

    const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
    const footer = `
## Session Ended
**Ended:** ${timestamp}
`;

    fs.appendFileSync(this.filePath, footer);
  }
}
