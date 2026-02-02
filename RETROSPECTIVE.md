# Retrospective Log

Learnings from agent-proxy improvement cycles.

---

## 2026-02-02: CLI Interface Conversion

**Feature:** Convert agent-proxy to proper CLI tool with `--dir`, `--direction`, `--help`, `--version` flags.

**Commits:** `fcef2c1`, `b2c46fc` (fix), `d237077` (CHANGELOG)

### What Went Well

**Proposal & Planning:**
- Clear problem identification (real pain point: `npm run dev` awkward for tool usage)
- Three-part proposal structure (Problem → Solution → Acceptance Criteria) kept discussion focused
- Minimal scope: No external dependencies, just `process.argv` parsing
- Staff pushed back appropriately on scope (challenged `--version`, kept it minimal)

**Process:**
- Test plan written and approved BEFORE implementation
- Channel separation (#planning for design, #implementation for code) reduced noise
- Evidence-based verification (5 specific items required)
- Multiple team members verified implementation matched proposal

**Collaboration:**
- Knowledge Coordinator provided accurate technical guidance (tsconfig settings, shebang handling)
- Architect's acceptance criteria were testable and specific
- Developer's test plan was comprehensive

### What Went Wrong

**CRITICAL: Broken Commit Shipped**
- Commit `fcef2c1` was approved and created with broken code
- `src/index.ts` was not properly refactored (missing exports)
- Build failed: `src/cli.ts` imported `createAgentProxy` which didn't exist
- Required follow-up fix commit `b2c46fc`

**Root Cause Analysis:**
1. Tests were run on working directory state (pre-commit)
2. File changes appeared successful but didn't persist correctly
3. No post-commit verification was performed
4. CHANGELOG was updated assuming commit was valid
5. Broken build entered git history

### Process Improvements

**NEW RULE: Post-Commit Verification is MANDATORY**

After Developer creates commit, BEFORE Staff updates CHANGELOG:

```bash
# 1. Verify commit contents
git show HEAD:src/file.ts | head -20

# 2. Verify build works on committed code
npm run build

# 3. Basic smoke test
node dist/cli.js --help

# 4. Only then: CHANGELOG update
```

**Additional Learnings:**

1. **Verify file persistence** - After Edit operations, read the file back to confirm changes saved
2. **Test after commit, not just before** - Working directory state may differ from committed state
3. **Include verification methods in acceptance criteria** - Not just "what" but "how to prove it"
4. **Show exact API signatures in proposals** - Reduces ambiguity about exports/interfaces

### Acceptance Criteria Template Update

Old format:
```
✅ TypeScript compilation succeeds without errors
```

Better format:
```
✅ TypeScript compilation succeeds
   - Verify: `npm run build` exits 0
   - Post-commit: Run again after commit to confirm
```

### Key Principle Reinforced

> "Trust but verify" - Approving based on reported results isn't enough. Independent verification of committed code is required.

---

## Template for Future Retrospectives

### What Went Well
- [List specific successes]

### What Went Wrong
- [List failures with root cause]

### Process Improvements
- [Concrete changes to workflow]

### Key Learning
- [One sentence takeaway]
