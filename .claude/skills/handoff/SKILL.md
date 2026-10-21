---
name: handoff
description: End a chat on Tom's Transfer Tools. Records what was done and what's next in PLAN.md, updates docs that changed, commits, merges into main, pushes, and gives the line that starts the next chat.
disable-model-invocation: true
---

Tom typed `/handoff`: this is his OK to commit and push this chat's work. Be token-efficient.

1. **Check what would be committed** (`git status`, `git diff --stat`). If something unfinished, untested or not yet shown to Tom would go in, ask him in one line whether to include it or leave it out, and wait. Never commit saves, test outputs (see `.gitignore`) or a `package-lock.json` made by `npm install` (delete it).
2. **Update `PLAN.md`** (keep it short; history lives in git):
   - "Where we are and what's next": what this chat finished, one line each with a real result (named players, counts); what's next.
   - "Task list": mark finished tasks done; add or reorder only what Tom agreed to. Each task should fit in one chat.
   - Tom's decisions, new findings and save facts go in the section they belong to.
3. **Other docs, only if needed:** a file, command, setting behavior or save fact changed → update `CLAUDE.md`. Otherwise leave them alone.
4. **Commit and merge.** Commit on the working branch with a message saying what the chat did. Then merge it into `main` with a merge commit, no rebase: `git fetch origin main`, `git checkout main`, `git merge --no-ff <branch>`, then push `main` and the branch. Cloud: push yourself (retry network failures up to 4 times). Tom's PC: auto mode blocks pushing, so give Tom the exact commands to run.
5. **Reply in 3–5 lines:** what was done, what the next task is, and: "Start a new chat and type `/next`."
