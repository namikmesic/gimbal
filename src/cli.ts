#!/usr/bin/env node
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { createAgentProxy } from "./index.js";

interface ParsedArgs {
  dir?: string;
  direction?: string;
  help?: boolean;
  version?: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--version" || arg === "-v") {
      parsed.version = true;
    } else if (arg === "--dir") {
      if (i + 1 >= args.length) {
        console.error("Error: --dir requires a path argument");
        process.exit(1);
      }
      parsed.dir = args[++i];
    } else if (arg === "--direction") {
      if (i + 1 >= args.length) {
        console.error("Error: --direction requires a text argument");
        process.exit(1);
      }
      parsed.direction = args[++i];
    } else {
      console.error(`Error: Unknown option: ${arg}\n`);
      showHelp();
      process.exit(1);
    }
  }

  return parsed;
}

function showHelp(): void {
  console.log(`
Usage: agent-proxy [options]

Options:
  --dir <path>        Working directory for agents (default: current directory)
  --direction <text>  Initial direction for agents (skips interactive prompt)
  --help, -h          Show this help message
  --version, -v       Show version number

Examples:
  agent-proxy                                    # Interactive mode
  agent-proxy --dir ./my-project                 # Specify working directory
  agent-proxy --direction "Fix auth bug"         # Pre-set direction
  agent-proxy --dir ./project --direction "..."  # Combined options
`);
}

function showVersion(): void {
  // Read version from package.json
  const packageJsonPath = path.join(path.dirname(new URL(import.meta.url).pathname), "../package.json");
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    console.log(packageJson.version);
  } catch (error) {
    console.error("Error reading version from package.json");
    process.exit(1);
  }
}

async function getInitialDirection(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      "\n[Direction] What should the agents focus on? (Enter for default): ",
      (input) => {
        rl.close();
        resolve(
          input.trim() ||
            "Explore the codebase and propose one improvement to make agent communication better."
        );
      }
    );
  });
}

function validateDirectory(dirPath: string): void {
  try {
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      console.error(`Error: '${dirPath}' is not a directory`);
      process.exit(1);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`Error: Directory '${dirPath}' does not exist`);
      process.exit(1);
    } else if ((error as NodeJS.ErrnoException).code === "EACCES") {
      console.error(`Error: Directory '${dirPath}' is not accessible`);
      process.exit(1);
    } else {
      console.error(`Error: Cannot access directory '${dirPath}'`);
      process.exit(1);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);

  // Handle help flag
  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // Handle version flag
  if (args.version) {
    showVersion();
    process.exit(0);
  }

  // Validate and resolve directory if provided
  let workingDirectory: string | undefined;
  if (args.dir) {
    const resolvedDir = path.resolve(args.dir);
    validateDirectory(resolvedDir);
    workingDirectory = resolvedDir;
  }

  // Get direction (from flag or interactive prompt)
  let direction: string | undefined;
  if (args.direction) {
    direction = args.direction;
  } else {
    direction = await getInitialDirection();
  }

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    process.exit(0);
  });

  // Create and run agent proxy
  await createAgentProxy({
    workingDirectory,
    initialDirection: direction,
  });
}

main();
