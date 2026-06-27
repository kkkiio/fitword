# AGENTS.md

## Policies & Mandatory Rules

### Language

When responding to users in this repository, use Chinese by default.

### Document Discipline

**PRD documents** (`docs/prd/`) describe product behavior — WHAT. No implementation details (tool parameters, SQL schemas, UI rendering logic).

**ADR documents** (`docs/adr/`) record technical decisions — HOW. Include context, alternatives considered, and consequences.

**CONTEXT.md** is a pure domain glossary. No implementation details, no version constraints.

When adding a new technical decision that is hard to reverse, surprising without context, and the result of a real trade-off, create a new `docs/adr/NNNN-title.md`.

Keep ADRs single-concern. When a document starts mixing unrelated decisions, split or rename it so later coding agents can identify the current source of truth.

### Tool vs Agent Boundary

Agent generates all content (questions, scoring, feedback). Tools handle only: display → collect → store. Tools never call LLMs.

Choice-question quality may be checked mechanically by tools using the Agent-provided correct answer. Fill-question quality and writing-scoring judgment remain Agent-generated.

Answer records use three-level `quality`: `0` means unusable/fail, `1` means usable but not ideal, `2` means good. Choice questions only produce `0` or `2`; fill questions may produce all three levels.

When adding a feature that requires LLM interaction, put the intelligence in the agent's system prompt, not in the tool implementation.

### Architecture Boundaries

Keep pi SDK integration thin. Fitword's business logic lives in tools and agent prompts, not in glue code between the server and pi SDK.

### Documentation Updates

Update README.md when user-visible project description, install steps, or usage changes.

Update AGENTS.md when new rules, directory restructuring, or build/test command changes occur.

Update CONTEXT.md when a new domain term is resolved or an existing term changes meaning.

## Project Structure Guide

### Overview

Fitword is a local LLM expression practice tool using pi SDK as the agent framework.

### Key Files

```
fitword/
├── CONTEXT.md                         # Domain glossary (pure terminology, no implementation)
├── README.md                          # User-facing project overview
├── AGENTS.md                          # This file
├── docs/
│   ├── prd/
│   │   ├── overview.md                # Background, target users, scope, success criteria
│   │   ├── practice-model.md          # Choice + fill formats, 5 knowledge types, feedback rules
│   │   └── scoring-model.md           # 5-dimension writing scoring practice
│   └── adr/
│       ├── 0001-sqlite-storage.md     # SQLite vs JSON decision
│       ├── 0002-local-web-ui.md       # Web UI vs CLI decision
│       ├── 0003-agent-tools-design.md # Tool definitions (ask_question, record_answer, evaluate_writing, get_practice_stats)
│       ├── 0004-pi-sdk-agent-framework.md  # pi SDK vs alternatives
│       ├── 0005-sqlite-schema.md      # Table definitions and queries
│       ├── 0007-ui-layout.md          # Web UI layout decision
│       ├── 0008-frontend-i18n.md      # Lingui UI i18n
│       ├── 0012-multi-session.md      # Multi-session lifecycle and API boundaries
│       ├── 0013-pi-sdk-event-reuse.md # SSE reuses pi SDK AgentSessionEvent
│       ├── 0014-instruction-tag.md    # <instruction> tag for scoring intent
│       └── 0015-bdd-e2e-testing.md    # playwright-bdd e2e with Pi faux provider
├── e2e/                               # playwright-bdd features, steps, fixtures, page objects
├── src/
│   ├── client/                        # React UI and Lingui setup
│   ├── locales/                       # Lingui message catalogs
│   └── server/                        # Hono server, storage, pi SDK agent tools
├── pnpm-lock.yaml                     # pnpm dependency lockfile
├── pnpm-workspace.yaml                # pnpm project-level settings
├── lingui.config.ts                   # Lingui catalog config
└── playwright.config.ts               # playwright-bdd test config
```

### Architecture

```
Web UI (React) ↔ Server (local) ↔ pi SDK Agent ↔ LLM API
                        ↕
                   ~/.fitword/
                ┌───────┴───────┐
             SQLite          jsonl
           (业务数据)      (对话历史)
```

- Session data: pi SDK jsonl in `~/.fitword/sessions/`
- Business data: SQLite in `~/.fitword/fitword.db`
- Tools: `ask_question`, `record_answer`, `evaluate_writing`, `get_practice_stats`
- pi SDK built-in tools (read, bash, edit, write) disabled
- Tests that need model behavior use Pi's official faux provider through `FITWORD_LLM_PROVIDER=faux`; do not reintroduce Fitword demo/fallback events.

## Operation Guide

### Prerequisites

- Node.js >= 22.19.0
- pnpm 10.34.4, managed through Corepack
- just, when using the convenience commands in `justfile`

### Install

```bash
corepack enable
corepack prepare pnpm@10.34.4 --activate
pnpm install
```

### Run

```bash
pnpm run dev
```

or:

```bash
just run
```

### Validate

For routine code changes, run fast validation by default:

```bash
just check
just test
```

Run local Playwright BDD e2e tests before committing or when changing `e2e/`, `playwright.config.ts`, server startup, SSE behavior, or critical user flows. For ordinary feature branches, prefer pushing the branch and letting GitHub CI run e2e through `.github/workflows/e2e.yml`.

```bash
pnpm run typecheck
pnpm run test
pnpm run test:e2e
pnpm run i18n:extract
```

`pnpm run test:e2e` uses `FITWORD_LLM_PROVIDER=faux` for BDD scenarios that need model behavior. The faux provider is Pi's official test provider and still exercises Pi SDK sessions, tool calls, SSE events, and jsonl persistence. Real model runs use `FITWORD_LLM_PROVIDER=openai-compatible` with `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL`.

### Convenience Commands

```bash
just fmt
just gen
just check
just test
just e2e
just build
just run
```

- `just fmt`: format repository files with Prettier.
- `just gen`: refresh Lingui catalogs and generated BDD files.
- `just check`: run fast static checks: typecheck, Prettier check, and `git diff --check`.
- `just test`: run unit tests.
- `just e2e`: run Playwright BDD e2e tests.
- `just build`: run the production Vite build.
- `just run`: start the local dev server.
