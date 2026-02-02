import * as readline from "readline";
import { AgentProxy } from "./proxy.js";
import { ProxyConfig } from "./types.js";

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

async function main() {
  const config: ProxyConfig = {
    workingDirectory: process.env.AGENT_PROXY_WORKDIR || process.cwd(),
    agents: [
      {
        id: "architect",
        name: "The Architect",
        systemPrompt: `You are the Architect, a system designer for the agent-proxy project.
Your job is to propose improvements to make agent communication better.
Review the codebase, understand how it works, then propose ONE improvement.

Your proposal MUST include:
1. Problem: What specific pain point are you solving?
2. Solution: What changes will be made (files, approach)?
3. Acceptance Criteria: What does success look like?
   - Functional requirements that must be met
   - What behavior should change (or not change)

Do NOT include implementation details or specific test commands.
Developer will determine HOW to verify your criteria.

Be specific - suggest actual code changes. Discuss with other agents via #planning.
Keep proposals focused and achievable. Quality over quantity.
Do NOT proceed to implementation until Staff approves your proposal.`,
        model: "sonnet",
        tools: ["Read", "Glob", "Grep"], // Can explore code but not modify
      },
      {
        id: "developer",
        name: "The Developer",
        systemPrompt: `You are the Developer, responsible for implementing changes.
When the team agrees on an improvement AND Staff approves, you write the code.

Your workflow:
1. Receive approved proposal with acceptance criteria from Architect
2. Write test plan: HOW to verify each acceptance criterion
   - Specific commands (npx tsc --noEmit, etc.)
   - Manual verification steps
   - Regression checks
3. Get Staff approval of test plan
4. Implement the changes
5. Execute test plan, report results with evidence in #implementation
6. After Staff approves, commit with: git add <files> && git commit -m "description"

Discuss feasibility in #planning, implement in #implementation.
Write clean, minimal code. Never skip the test plan.`,
        model: "sonnet",
        tools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"], // Full code access
      },
      {
        id: "staff",
        name: "The Staff Engineer",
        systemPrompt: `You are the Staff Engineer, the senior voice of experience and quality gatekeeper.

Your responsibilities:
- Challenge proposals: Is this solving a REAL pain point or theoretical?
- Push back on complexity: If it's over-engineered, reject it
- Review proposals: Approve Architect's problem + solution + acceptance criteria
- Review test plans: Before approving Developer's test plan, ensure it covers:
  * Compilation verification
  * Manual verification steps that prove it works
  * Regression checks for what could break
- Approve or reject: Say "APPROVED" only when proposal/test plan are solid
- After implementation: Verify Developer ran the tests, then approve commit
- After approving commit: Update CHANGELOG.md with what changed, why, and how it was verified
- Keep scope tight: One improvement at a time, no feature creep

You have access to Bash for git commands (git status, git log, git diff).
Be concise but authoritative. Nothing moves to implementation without your approval.`,
        model: "opus",
        tools: ["Read", "Write", "Bash", "Glob", "Grep"], // Can review code, use git, and write docs
      },
      {
        id: "knowledge",
        name: "Knowledge Coordinator",
        systemPrompt: `You are the codebase knowledge expert.

You have already read and understood all source files in this project.
Your job is to answer questions about the codebase quickly and accurately.

Listen on #knowledge channel for questions from other agents.
When asked, respond with:
- Relevant file path(s)
- Specific line numbers
- Code snippets
- Concise explanations

Do not speculate. Only answer based on what you've read.`,
        model: "sonnet",
        tools: ["Read", "Glob", "Grep"],
      },
    ],
  };

  const proxy = new AgentProxy(config);

  console.log("\n=== Self-Improving Agent Demo ===\n");
  console.log("Agents:", proxy.getAgentIds().join(", "));
  console.log("Working directory:", config.workingDirectory);

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    proxy.stop();
    process.exit(0);
  });

  // Subscribe all agents to #planning channel for discussions
  for (const agentId of proxy.getAgentIds()) {
    proxy.subscribeAgentToChannel(agentId, "#planning");
    proxy.subscribeAgentToChannel(agentId, "#implementation");
  }
  console.log("All agents subscribed to #planning and #implementation channels\n");

  // Subscribe knowledge agent to #knowledge channel
  proxy.subscribeAgentToChannel("knowledge", "#knowledge");
  console.log("Knowledge agent subscribed to #knowledge channel\n");

  // Initialize knowledge agent
  console.log("\n[Demo] Initializing knowledge agent...\n");
  const knowledgeResponse = await proxy.sendInitialPrompt(
    "knowledge",
    `You are the codebase knowledge coordinator. Your job is to become an expert on this codebase.

STEP 1: Use Glob to find all TypeScript files in src/
STEP 2: Read each file using the Read tool
STEP 3: Build your understanding of:
- What each file does
- Key functions and classes
- How components interact
- Dependencies between files

STEP 4: Subscribe to #knowledge channel using the subscribe tool
STEP 5: Wait for questions from other agents on #knowledge

When answering questions:
- Cite specific file paths
- Include line numbers
- Provide relevant code snippets
- Be concise and accurate

Begin initialization now.`
  );
  console.log(`[Knowledge agent initialized]\n`);

  // Get initial direction from user
  const direction = await getInitialDirection();

  // Kick off the self-improvement session
  console.log("\n[Demo] Starting self-improvement session with Architect...\n");

  try {
    const response = await proxy.sendInitialPrompt(
      "architect",
      `Welcome! You're working on the agent-proxy codebase in ${config.workingDirectory}.

[HUMAN DIRECTION]: ${direction}

Your team:
- You (Architect): Explore, propose solutions, define acceptance criteria
- Developer: Implements, writes test plan, executes tests
- Staff Engineer: Quality gate, approves proposals + test plans, documents

Workflow:
1. You explore and propose (problem + solution + acceptance criteria) in #planning
2. Staff reviews and approves proposal
3. Developer writes test plan to verify your acceptance criteria
4. Staff approves test plan
5. Developer implements and runs tests
6. Staff verifies, approves commit, updates CHANGELOG

Start by exploring the codebase, then work on the direction given above.
Publish your proposal to #planning for team discussion.`
    );

    console.log(`[Architect's initial response]: ${response}\n`);

    // Run the message loop
    console.log("[Demo] Starting message loop...\n");
    await proxy.runLoop();
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
