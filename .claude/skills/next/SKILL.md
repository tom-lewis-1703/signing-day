---
name: next
description: Start a new chat on Tom's Transfer Tools. Reads the status in PLAN.md, restates the next task, lists exactly what will change, and waits for Tom's OK.
disable-model-invocation: true
---

Tom typed `/next` to start a new chat. One task per chat. Be token-efficient.

1. **Branch.** Cloud: work on this session's designated branch; if it doesn't exist yet, create it from `main`. Tom's PC: create `claude/<short-task-name>` from `main`. If the branch is behind `main`, merge `main` in first.
2. **Read only what you need.** `CLAUDE.md` is already loaded. In `PLAN.md` read "Where we are and what's next" and "Task list". Read other sections, code or the walkthrough page only where the task needs them.
3. **Take the top task that isn't done** in "Task list" and has no `(builder: …)` tag (a builder session is on it). Reply to Tom in plain words, short:
   - the task in one or two sentences, and why it's next;
   - exactly what you'll change (files, settings, screens) and what you won't;
   - how you'll test it: the minimum that proves it works (one fresh copy of a test save, a few named players, league counts);
   - any tuning choice you need from him, as a question (don't guess);
   - if it looks too big for one chat, say so and propose a split.
4. **Stop and wait for Tom's OK.** Then follow `CLAUDE.md` (small pieces, check in after each, mockup before any screen change, no extras, no commit until he's seen the result).

When the task is finished and Tom is happy, he ends the chat with `/handoff`.
