#!/usr/bin/env node
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { createGimbal } from "./index.js";

interface ParsedArgs {
  dir?: string;
  direction?: string;
  help?: boolean;
  version?: boolean;
  selfImprove?: boolean;
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
    } else if (arg === "--self-improve") {
      parsed.selfImprove = true;
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
Usage: gimbal [options]

Options:
  --dir <path>         Working directory for agents (default: current directory)
  --direction <text>   Initial direction for agents (skips interactive prompt)
  --self-improve       Run in self-improvement mode (gimbal improves itself)
  --help, -h           Show this help message
  --version, -v        Show version number

Examples:
  gimbal                                    # Interactive mode
  gimbal --dir ./my-project                 # Specify working directory
  gimbal --direction "Fix auth bug"         # Pre-set direction
  gimbal --dir ./project --direction "..."  # Combined options
  gimbal --self-improve                     # Self-improvement mode
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

async function getSelfImproveDirection(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      "\n[Self-Improve] What should gimbal improve about itself? (Enter for default): ",
      (input) => {
        rl.close();
        resolve(
          input.trim() ||
            "Analyze gimbal's recent retrospectives and changelog, then propose one improvement to the multi-agent coordination or workflow."
        );
      }
    );
  });
}

function getGimbalRootDir(): string {
  // From dist/cli.js, go up one level to project root
  const cliDir = path.dirname(new URL(import.meta.url).pathname);
  return path.resolve(cliDir, "..");
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

  // Handle self-improve mode
  if (args.selfImprove) {
    if (args.dir) {
      console.warn("Warning: --dir is ignored in --self-improve mode");
    }
    workingDirectory = getGimbalRootDir();
    console.log(`[Self-Improve Mode] Working on gimbal at: ${workingDirectory}`);
  }

  // Get direction (from flag or interactive prompt)
  let direction: string | undefined;
  if (args.direction) {
    direction = args.direction;
  } else if (args.selfImprove) {
    direction = await getSelfImproveDirection();
  } else {
    direction = await getInitialDirection();
  }

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    process.exit(0);
  });

  // Create and run gimbal
  await createGimbal({
    workingDirectory,
    initialDirection: direction,
    selfImproveMode: args.selfImprove || false,
  });
}

main();
