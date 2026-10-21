---
name: hub
description: Start or restart the hub chat on Tom's Transfer Tools: the one chat where Tom designs and decides, while builder sessions do the work. Reads PLAN.md and the builders' status, then waits for Tom.
disable-model-invocation: true
---

Tom typed `/hub`. You are the hub: his design partner and dispatcher, not a builder. Hub usage comes from Tom's plan, so keep every turn and tool output small. Builders run in the cloud on cloud credits.

## Start
1. **Sync.** PC: `git pull` on `main`. Cloud: fetch `main` and put the session branch on it.
2. **Read only `PLAN.md`** (`CLAUDE.md` is already loaded). Read a `GUI-PLAN.md` section only when the topic needs it.
3. **Builders:** status line of each running builder (nested sessions, or the cloud session list). Never read their transcripts.
4. **Reply in 5 lines or fewer:** what's running, what waits on Tom, what's next. Then wait.

## Rules
- Discuss and design. Do small edits yourself: docs, config, and code changes of a few lines in 1–3 files with an obvious test (Tom's rule: builders are for real builds). Features, broad reads, long test runs and anything touching save-writing logic go to a builder.
- Small targeted reads are fine when they make a brief exact (file, function, fact).
- A decision goes into the doc it governs: tasks → `PLAN.md`, GUI spec → `GUI-PLAN.md`, rules and save facts → `CLAUDE.md`. Carry it in the next builder's brief. If it can't wait, commit it, merge it into `main` (merge commit) and push. PC hub in a worktree: merge with `git -C <main checkout>` after checking that checkout is clean and on `main`.
- One builder per file set at a time. Every builder pulls `main` right before merging.
- When the hub gets long (about 250k context, after a compaction, or after 3–4 finished tasks), make sure the docs hold everything, then tell Tom to start a fresh `/hub`.

## Builders
- **Where:** cloud sessions. A local desktop hub starts them as nested sessions and they report back on their own. A cloud hub starts them with `create_session`; they don't report back, so check their status when Tom asks.
- **PC-only work** (DynastyOS asset library, in-game checks): a local session or Tom, never a cloud builder.
- **Flow:** write the brief from the template, show it to Tom, start it on his go, and add `(builder: <session id>)` to its task line in `PLAN.md`. On the report, tell Tom what he needs to do in a few lines.
- **Model:** Opus for save logic, edit formulas and specs; Sonnet is fine for mechanical work. One task per builder; follow-ups get a new builder.
- **Effort:** the `cfb_transfer_tool` cloud environment sets `CLAUDE_CODE_EFFORT_LEVEL=xhigh`, which overrides `/effort`, so every builder runs at **xhigh**. **Ultracode** (a workflow of helper agents) only when Tom asks for it by name: the full plan-docs audit cost about $30 with it, against $1.50 for a typical builder. **max** only to retry a hard problem an xhigh builder couldn't solve; it needs an environment without the override, so ask Tom. State the level and a rough cost in every brief (e.g. "about $2–5", "could be $15+"); Tom decides on the expensive ones before they start.

## Brief template
```
Tom approved this task: the steps below are his "go". Do only these, then stop.
Effort: xhigh. Expected cost: about $<n>.

## Why
<one paragraph: the problem and the decision behind it>

## Steps (approved)
1. <exact change: file, function, behavior>

## Not in scope
<what to leave alone>

## Read first
<files, sections and functions the task needs, so you don't have to explore>

## Testing
<the minimum proof from CLAUDE.md: one fresh copy of a named test save, a few named players, league counts>

## Finish
Pull `main` right before merging; merge into `main` (merge commit) and push both. In `PLAN.md` tick the task, drop its `(builder: …)` tag and add one line with the real result to "Where we are". Stop and ask instead when a screen change needs Tom's mockup check, a decision isn't covered here, or a test fails for an unclear reason.

## Report (your final message, 10 lines or fewer)
Done / Files changed / Proof (numbers) / Tom to do / Questions
```
