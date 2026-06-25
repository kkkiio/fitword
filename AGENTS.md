# AGENTS.md

## Policies & Mandatory Rules

### Language

When responding to users in this repository, use Chinese by default.

### Document Discipline

**PRD documents** (`docs/prd/`) describe product behavior — WHAT. No implementation details (tool parameters, SQL schemas, UI rendering logic).

**ADR documents** (`docs/adr/`) record technical decisions — HOW. Include context, alternatives considered, and consequences.

**CONTEXT.md** is a pure domain glossary. No implementation details, no version constraints.

When adding a new technical decision that is hard to reverse, surprising without context, and the result of a real trade-off, create a new `docs/adr/NNNN-title.md`.

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
│       ├── 0006-system-prompt.md      # Agent prompt behavior rules
│       ├── 0007-ui-layout.md          # Web UI layout decision
│       └── 0008-i18n-and-bdd-e2e.md   # Lingui UI i18n + playwright-bdd e2e
├── e2e/                               # playwright-bdd features, steps, fixtures, page objects
├── src/
│   ├── client/                        # React UI and Lingui setup
│   ├── locales/                       # Lingui message catalogs
│   └── server/                        # Hono server, storage, pi SDK agent tools
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

## Operation Guide

### Prerequisites

- Node.js >= 20.6
- npm

### Install

```bash
npm install
```

### Run

```bash
npm run dev
```

### Validate

```bash
npm run typecheck
npm run test
npm run test:e2e
npm run i18n:extract
```

`npm run test:e2e` includes an online writing-scoring BDD scenario backed by the configured model service. It is enabled only when `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` are present in `.env` or the environment; otherwise it skips.
