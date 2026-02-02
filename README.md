# agent-proxy

Multi-agent proxy for peer-to-peer Claude communication. A CLI tool that orchestrates a team of AI agents to collaboratively analyze codebases, propose improvements, and implement changes.

## What is agent-proxy?

agent-proxy is a command-line tool that runs a multi-agent system where specialized AI agents work together to understand and improve your codebase. Three agents collaborate: an Architect proposes improvements, a Developer implements them, and a Staff Engineer ensures quality through review and approval.

## Installation

### Global Installation (Recommended)

Install globally to use `agent-proxy` from anywhere:

```bash
npm install -g agent-proxy
```

### One-Off Usage

Run without installation using npx:

```bash
npx agent-proxy
```

## Quick Start

### Interactive Mode

Simply run the command and respond to the prompt:

```bash
agent-proxy
```

You'll see:
```
[Direction] What should the agents focus on? (Enter for default):
```

Type your task (e.g., "Add user authentication" or "Optimize database queries") and press Enter. The agents will collaborate to complete your request.

### Direct Command

Skip the interactive prompt by providing a direction directly:

```bash
agent-proxy --direction "Refactor the authentication module"
```

### Custom Working Directory

Run agents in a specific directory:

```bash
agent-proxy --dir /path/to/your/project --direction "Review error handling"
```

## CLI Reference

### `--dir <path>`

Specify the working directory for the agents. Defaults to the current directory.

**Example:**
```bash
agent-proxy --dir ~/my-project
```

### `--direction <text>`

Provide the initial task direction for the agents, bypassing the interactive prompt.

**Example:**
```bash
agent-proxy --direction "Add comprehensive logging"
```

### `--help` / `-h`

Display help information and usage examples.

**Example:**
```bash
agent-proxy --help
```

### `--version` / `-v`

Show the current version of agent-proxy.

**Example:**
```bash
agent-proxy --version
```

## How It Works

When you run agent-proxy, three specialized agents collaborate in communication channels:

- **Architect** analyzes the codebase and proposes improvements in `#planning`
- **Developer** implements the approved changes in `#implementation`
- **Staff Engineer** reviews proposals and code to ensure quality

A fourth agent, the **Knowledge Coordinator**, provides codebase insights to support the team.

The agents communicate through channels (similar to Slack/Discord), discuss approaches, and work together to complete your task. All collaboration happens transparently so you can follow along.

## Development

### Build from Source

```bash
git clone <repository-url>
cd agent-proxy
npm install
npm run build
```

### Run in Development Mode

```bash
npm run dev
```

## Documentation

- **[CLAUDE.md](CLAUDE.md)** - Detailed architecture and AI development guide
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and release notes
- **[RETROSPECTIVE.md](RETROSPECTIVE.md)** - Team learnings and process improvements

## License

MIT
