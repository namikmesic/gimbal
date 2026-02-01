# Changelog

All notable changes to the agent-proxy-experiment will be documented in this file.

## [Unreleased]

### Changed - 2026-02-02

#### Tool Permissions Extraction
- Extracted hardcoded tool permissions from `agent-session.ts` to declarative agent configuration
- Added `ToolName` union type for compile-time validation of tool names
- Added optional `tools` field to `AgentConfig` interface
- Simplified permission logic from 8 lines of nested conditionals to 1 line: `this.config.tools || []`
- Made agent capabilities explicit and visible at configuration level
- Commit: `c3e95ca`

**Technical Details:**
- Modified files: `src/types.ts`, `src/agent-session.ts`, `src/index.ts`
- Code reduction: 38 deletions, 111 insertions (net: +73 lines, but removed conditional complexity)
- Type safety: `ToolName = "Read" | "Edit" | "Write" | "Bash" | "Glob" | "Grep"` provides autocomplete and compile-time validation
- Default behavior: `tools || []` treats undefined and empty array identically (safe default)
- **Zero behavior changes:** Pure refactoring - all agents maintain exact same tool access

**Decision Rationale:**
- Original problem: Tool permissions hardcoded in runtime logic made system less modular
- Architect proposed extracting to config for better separation of concerns
- Team discussion addressed validation strategy and type safety
- Consensus: Add compile-time type safety, skip runtime validation (trust config)
- Staff enforced scope discipline: "One thing at a time - no validation infrastructure"

**Collaborative Design Process:**
- Architect proposed extraction with detailed benefits analysis
- Staff raised questions about validation and default behavior
- Developer confirmed feasibility and suggested type safety approach
- Critic validated quality and approved with suggestions
- Staff made final call: type safety yes, runtime validation no (scope control)
- Result: Simple refactoring with compile-time safety, no scope creep

**Key Principle Reinforced:**
> "Configuration over code - make system capabilities explicit and declarative"

**Benefits Achieved:**
- ✅ More intuitive: Tool access visible in config, not buried in conditionals
- ✅ More modular: Adding new agents requires no code changes
- ✅ Better separation: Configuration vs. runtime logic cleanly separated
- ✅ Type-safe: Compile-time validation prevents typos

This refactoring demonstrates how proper separation of concerns improves both code clarity and system extensibility.

---

### Added - 2026-02-01

#### Message Threading - Phase 1
- Added reply context display in message formatter
- Messages now show `(replying to msg_X)` when they reference previous messages
- Enables agents to track conversation threads and understand message context
- **Implementation note:** This surfaces existing infrastructure that was previously invisible - the `replyTo` field has always been supported by the messaging system, but wasn't displayed to agents
- Minimal implementation: displays message ID only, no content cache or lookup
- Commit: `5d20499`

**Decision Rationale:**
- Started with proposal for 50-message cache with content previews
- Team discussion (Staff, Critic, Architect) led to simplified approach
- Consensus: "Start simple, prove value before adding complexity"
- Phase 2 (message preview cache) deferred pending real usage data

**Collaborative Design Process:**
- Architect proposed initial solution with caching
- Critic challenged complexity vs. value proposition
- Staff enforced scope discipline and minimal approach
- Architect revised to simpler solution based on feedback
- Result: Better solution through consensus-driven design

**Key Principle Extracted:**
> "Build the minimal thing first, add complexity only when proven necessary"

This pattern of proposal → critique → revision → consensus serves as a model for future engineering decisions.

---

## Notes

This changelog follows the principles of:
- Documenting not just *what* changed, but *why*
- Capturing the collaborative decision-making process
- Extracting reusable principles for future work
- Giving credit to team discussion and iteration
