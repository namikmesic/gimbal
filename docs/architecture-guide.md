# Gimbal Architecture Guide

This guide explains how Gimbal's control loop and state machine work, and how to extend it with custom workflows.

## Overview

Gimbal is a multi-agent orchestration system where AI agents collaborate to complete software engineering tasks. Think of it as a virtual team where each agent has a specific role (architect, developer, staff engineer) and they communicate through messages.

```
┌─────────────────────────────────────────────────────────────┐
│                      Human Director                          │
│                    (you, via terminal)                       │
└──────────────────────────┬──────────────────────────────────┘
                           │ direction
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                       Orchestrator                           │
│              (coordinates everything)                        │
└──────┬──────────────────┬───────────────────┬───────────────┘
       │                  │                   │
       ▼                  ▼                   ▼
   ┌────────┐        ┌────────┐         ┌────────┐
   │Architect│◄─────►│Developer│◄───────►│ Staff  │
   └────────┘        └────────┘         └────────┘
         │                │                  │
         └────────────────┴──────────────────┘
                    Message Queue
                   (pub/sub channels)
```

## The Event Loop

### How Agents Work

The system runs an **event-driven loop** - agents don't constantly check for work. Instead, they sleep until a message arrives, then wake up to process it.

```
Agent Loop (runs continuously for each agent):
  1. Am I paused? → Wait until resumed
  2. Do I have messages? → If no, sleep until one arrives
  3. Process messages → Use tools, send responses
  4. Go back to step 1
```

**Why this matters**: The system is efficient. Agents don't waste CPU cycles polling. They wake instantly when there's work to do.

### Message Flow

When Agent A sends a message to Agent B:

```
Agent A calls send_message("agent-b", "Please review this")
    │
    ▼
Message Router receives the message
    │
    ├─► Stores message in Agent B's queue
    │
    └─► Triggers Agent B's "wakeup" callback
            │
            ▼
        Agent B wakes up and processes the message
```

## State Machines

There are two state machines: one for individual agents, one for the overall workflow.

### Agent Lifecycle States

Each agent has a lifecycle state:

```
┌─────────┐     ┌──────────┐     ┌───────┐
│ created │────►│ starting │────►│ ready │◄──────┐
└─────────┘     └──────────┘     └───┬───┘       │
                                     │           │
                                     ▼           │
                               ┌────────────┐    │
                               │ processing │────┘
                               └────────────┘

Any state ───► stopped (when system shuts down)
```

| State | Meaning |
|-------|---------|
| `created` | Agent exists but hasn't started |
| `starting` | Agent is initializing (loading tools, connecting to Claude) |
| `ready` | Agent is waiting for messages |
| `processing` | Agent is actively working on messages |
| `stopped` | Agent has been shut down |

### Workflow Phases

The workflow progresses through phases. Each phase has an owner and produces specific artifacts:

```
proposal ──► proposal-review ──► test-planning ──► test-review ──► implementation ──► documentation
    │              │                   │               │                │                  │
Architect       Staff             Developer         Staff          Developer            Staff
```

| Phase | Owner | What Happens |
|-------|-------|--------------|
| `proposal` | Architect | Explores codebase, identifies problem, proposes solution |
| `proposal-review` | Staff | Reviews proposal, approves or requests changes |
| `test-planning` | Developer | Designs test plan to verify the solution |
| `test-review` | Staff | Reviews test plan, approves or requests changes |
| `implementation` | Developer | Writes code, runs tests |
| `documentation` | Staff | Updates CHANGELOG, writes retrospective |

### Workflow Completion

When all agents finish their work, they "sign off":

```
All agents sign off
    │
    ▼
System pauses
    │
    ▼
Human Director prompts you:
  "Enter direction, or /fresh for fresh start"
    │
    ├─► New direction → Agents resume with new task
    │
    └─► /fresh → Reset all agent contexts, start clean
```

## Communication Patterns

Agents communicate in three ways:

### 1. Direct Messages
One agent to another:
```
send_message("developer", "Please implement the login feature")
```

### 2. Channel Publishing
Broadcast to all subscribers of a channel:
```
subscribe("#planning")           // Join the channel
publish("#planning", "Proposal: Add caching layer")  // Everyone subscribed sees this
```

### 3. Broadcast
Send to all agents:
```
broadcast("System maintenance in 5 minutes")
```

## Available Commands

As a human operator, you can control the system with slash commands:

| Command | Action |
|---------|--------|
| `/help` | Show available commands |
| `/status` | Display current workflow state, agent states, channels |
| `/pause` | Pause all agents (they stop processing) |
| `/resume` | Resume paused agents |
| `/fresh` | Reset all agent contexts (start over) |
| `/quit` | Exit the system |

Any other text you type becomes "direction" broadcast to all agents.

## Extension Points

Here's where you can customize Gimbal:

### 1. Add New Agent Roles

In `index.ts`, add a new agent configuration:

```typescript
{
  id: "security-reviewer",
  name: "Security Reviewer",
  systemPrompt: `You are a security expert. Review code for vulnerabilities...`,
  model: "sonnet",
  agentType: "workflow",  // or "support" for always-available helpers
  tools: ["Read", "Glob", "Grep"],
}
```

**Agent Types:**
- `workflow`: Participates in phases, can sign off, counts toward completion
- `support`: Always available helper (like a knowledge agent), doesn't block workflow

### 2. Add New Workflow Phases

In `types.ts`, extend the `WORKFLOW_PHASES` constant:

```typescript
{
  id: "security-review",
  name: "Security Review",
  owner: "security-reviewer",
  requiredPriorPhases: ["implementation"],
  produces: ["security-report"],
  completionCriteria: "Security review approved",
}
```

### 3. Add New Slash Commands

In `human-director.ts`, add to `handleCommand()`:

```typescript
case "agents":
  this.listAgentsCallback?.();
  break;
```

Then wire it up in `orchestrator.ts`:

```typescript
this.humanDirector.onListAgents(() => {
  this.printAgentDetails();
});
```

### 4. Add New Messaging Tools

In `agent-lifecycle.ts`, within `createMessagingServer()`:

```typescript
{
  name: "request_review",
  description: "Request a code review from staff",
  inputSchema: { ... },
  async handler(args) {
    // Custom logic here
    return { content: [{ type: "text", text: "Review requested" }] };
  }
}
```

### 5. Add External Tool Servers (MCP)

Agents can use external tools via MCP servers. In agent config:

```typescript
{
  id: "researcher",
  // ... other config
  mcpServers: [
    {
      name: "web-search",
      command: "npx",
      args: ["-y", "@anthropic/mcp-server-web-search"],
    }
  ]
}
```

The agent can then use tools like `mcp__web-search__search`.

## Writing Custom Workflows

To create a custom workflow:

### Step 1: Define Your Phases

Think about what stages your workflow needs:

```
Example: Bug Fix Workflow
1. triage       - Understand the bug
2. reproduce    - Create reproduction steps
3. fix          - Implement the fix
4. verify       - Run tests, confirm fix
5. document     - Update docs if needed
```

### Step 2: Define Your Agents

What roles do you need?

```typescript
const agents = [
  { id: "triager", name: "Bug Triager", tools: ["Read", "Grep"], agentType: "workflow" },
  { id: "fixer", name: "Bug Fixer", tools: ["Read", "Edit", "Write", "Bash"], agentType: "workflow" },
  { id: "verifier", name: "QA Verifier", tools: ["Read", "Bash"], agentType: "workflow" },
];
```

### Step 3: Write System Prompts

Each agent needs clear instructions:

```typescript
{
  id: "triager",
  systemPrompt: `You are a bug triager. Your responsibilities:
1. Read the bug report carefully
2. Search the codebase to understand the affected area
3. Classify severity (critical/high/medium/low)
4. Write a clear summary for the fixer

When done, publish your analysis to #bugs and sign off.`,
}
```

### Step 4: Set Up Channels

Subscribe agents to relevant channels:

```typescript
// In createGimbal() or index.ts
orchestrator.subscribeAgentToChannel("triager", "#bugs");
orchestrator.subscribeAgentToChannel("fixer", "#bugs");
orchestrator.subscribeAgentToChannel("verifier", "#bugs");
```

### Step 5: Define Checkpoints (Optional)

For quality gates, use the checkpoint system:

```typescript
// Agent requests approval
const checkpointId = await checkpoint.requestApproval("fix", artifactRef);

// Approver reviews and approves/rejects
checkpoint.approve(checkpointId, "Fix looks good");
// or
checkpoint.reject(checkpointId, "Missing edge case handling");
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `index.ts` | Agent configurations, workflow setup |
| `orchestrator.ts` | Main control loop, coordinates everything |
| `agent-lifecycle.ts` | Individual agent behavior, tool definitions |
| `human-director.ts` | Terminal input handling, slash commands |
| `message-router.ts` | Routes messages between agents |
| `channel-registry.ts` | Manages pub/sub channels |
| `types.ts` | All type definitions, workflow phases |
| `checkpoint.ts` | Quality gates for approvals |

## Debugging Tips

1. **Check workflow state**: Use `/status` to see current phase and agent states

2. **Watch message flow**: The orchestrator logs message delivery:
   ```
   [Orchestrator] architect: Analyzing codebase structure...
   ```

3. **Agent not responding?** Check if:
   - System is paused (`/status` shows `Paused: true`)
   - Agent has correct channel subscriptions
   - Agent's tools array includes needed tools

4. **Reset if stuck**: Use `/fresh` to reset all agent contexts

## Summary

- **Event Loop**: Agents sleep until messages arrive, then wake to process
- **Two State Machines**: Agent lifecycle (created→ready→processing) and workflow phases
- **Communication**: Direct messages, channels (pub/sub), or broadcast
- **Extension**: Add agents, phases, commands, or external tools
- **Control**: Use slash commands (`/status`, `/pause`, `/resume`, `/fresh`)

The system is designed to be extended. Start by understanding the existing workflow, then customize agents and phases for your needs.
