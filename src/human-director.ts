import * as readline from "readline";
import { HumanDirector as IHumanDirector } from "./types.js";

type DirectionCallback = (direction: string) => void;
type FreshStartCallback = () => void;

/**
 * Handles human input and direction via readline interface.
 */
export class HumanDirectorImpl implements IHumanDirector {
  private rl: readline.Interface | null = null;
  private directionCallback: DirectionCallback | null = null;
  private freshStartCallback: FreshStartCallback | null = null;
  private running = false;

  startListening(): void {
    if (this.rl) return;

    this.running = true;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.startDirectionInputLoop();
  }

  stopListening(): void {
    this.running = false;
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  onDirection(callback: DirectionCallback): void {
    this.directionCallback = callback;
  }

  onFreshStart(callback: FreshStartCallback): void {
    this.freshStartCallback = callback;
  }

  async prompt(message: string): Promise<string> {
    return new Promise((resolve) => {
      if (!this.rl) {
        resolve("");
        return;
      }

      this.rl.question(message, (input) => {
        resolve(input);
      });
    });
  }

  /**
   * Prompt for direction after all agents have signed off.
   * Allows user to continue with context or start fresh.
   */
  promptForFreshStartChoice(): void {
    if (!this.rl) return;

    this.rl.question(
      "\n[All agents signed off] Enter direction, or type 'fresh' for fresh start: ",
      (input) => {
        if (input.toLowerCase() === "q") {
          this.stopListening();
          process.exit(0);
        }

        const isFreshStart = input.toLowerCase() === "fresh";

        if (isFreshStart) {
          console.log("[Director] Fresh start - resetting all agent contexts");
          if (this.freshStartCallback) {
            this.freshStartCallback();
          }
          // Re-prompt for actual direction
          this.rl?.question(
            "\n[Direction] Enter guidance for fresh start: ",
            (direction) => {
              if (direction.toLowerCase() === "q") {
                this.stopListening();
                process.exit(0);
              }
              if (direction.trim() && this.directionCallback) {
                this.directionCallback(direction);
              }
              this.startDirectionInputLoop();
            }
          );
        } else if (input.trim()) {
          // Continue with existing context
          console.log("[Director] Continuing with existing context");
          if (this.directionCallback) {
            this.directionCallback(input);
          }
          this.startDirectionInputLoop();
        } else {
          // Empty input, re-prompt
          this.promptForFreshStartChoice();
        }
      }
    );
  }

  private startDirectionInputLoop(): void {
    const promptForDirection = () => {
      if (!this.running || !this.rl) return;

      this.rl.question(
        "\n[Direction] Enter guidance (or 'q' to quit): ",
        (input) => {
          if (input.toLowerCase() === "q") {
            this.stopListening();
            void (process.exit(0) as never);
          } else {
            if (input.trim() && this.directionCallback) {
              this.directionCallback(input);
            }
            promptForDirection();
          }
        }
      );
    };

    promptForDirection();
  }
}
