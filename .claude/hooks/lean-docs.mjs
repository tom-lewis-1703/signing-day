// PreToolUse hook (.claude/settings.json): blocks a git commit that adds decision notes or history
// to the docs (CLAUDE.md "How we work"). Checks the lines added to PLAN.md, GUI-PLAN.md and CLAUDE.md
// since HEAD, staged or not; exit 2 shows the hits to the session and stops the commit.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const DOCS = ["PLAN.md", "GUI-PLAN.md", "CLAUDE.md"];
const SLIPS = [
  [/\bok'?d\b/i, "a sign-off"],
  [/\b(approved|decided|answered|agreed)\b/i, "a decision note"],
  [/\bno longer\b|\bwas planned\b|\bremoved in\b|\bpreviously\b/i, "history"],
  [/§[\d.]+\s*Q\d/, "a citation of a question"]
];

const input = JSON.parse(fs.readFileSync(0, "utf8"));
const cmd = String(input.tool_input?.command ?? "");
if (!/\bgit\b[^\n|;&]*\bcommit\b/.test(cmd)) process.exit(0);

// `git -C <dir> commit` runs elsewhere; an unresolvable dir (a shell variable) falls back to the session's.
const m = cmd.match(/\bgit\s+-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
const dir = m && (m[1] ?? m[2] ?? m[3]);
const cwd = dir && fs.existsSync(dir) ? dir : input.cwd;

let diff;
try { diff = execFileSync("git", ["diff", "HEAD", "-U0", "--", ...DOCS], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
catch { process.exit(0); }   // not a repo, or no HEAD yet

const hits = [];
let file = "";
for (const line of diff.split("\n")) {
  if (line.startsWith("+++ ")) { file = line.replace(/^\+\+\+ b\//, ""); continue; }
  if (!line.startsWith("+")) continue;
  for (const [re, what] of SLIPS) if (re.test(line)) { hits.push(`${file}: ${what}: ${line.slice(1).trim()}`); break; }
}
if (!hits.length) process.exit(0);
console.error(`Docs hold only current facts (CLAUDE.md "How we work"). Reword these added lines, then commit again:\n${hits.join("\n")}`);
process.exit(2);
