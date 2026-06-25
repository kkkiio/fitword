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

Choice-question correctness may be checked mechanically by tools using the Agent-provided correct answer. Fill-question and writing-scoring judgment remains Agent-generated.

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
│       └── 0005-sqlite-schema.md      # Table definitions and queries
└── src/                               # Runtime code (TBD)
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

- Node.js >= 18
- npm

### Install

```bash
npm install
```

### Run

```bash
# TBD - development server
npm run dev
```

### Validate

```bash
# TBD
npm run typecheck
npm run test
```
