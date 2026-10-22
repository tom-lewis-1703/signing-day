import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const BACKUP_DIR_NAME = "TTT Backups";

// Both spelling and canonical path matter on Windows (including junctions).
export function assertWritableSave(filePath) {
  const absolute = path.resolve(filePath);
  const canonical = fs.realpathSync(absolute);
  if ([absolute, canonical].some(p => p.split(/[\\/]+/).some(part => part.toLowerCase() === "test_saves"))) {
    throw new Error("Refusing to write test_saves/; copy the fixture into test_runs/ first.");
  }
  return canonical;
}

function sha1(file) {
  return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
}

function stamp(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Copies the save into "<save folder>\TTT Backups\<name>__<timestamp>.bak" and checks the copy.
export function backupSave(filePath) {
  assertWritableSave(filePath);
  const dir = path.join(path.dirname(filePath), BACKUP_DIR_NAME);
  fs.mkdirSync(dir, { recursive: true });
  const base = `${path.basename(filePath)}__${stamp()}`;
  let backupPath = path.join(dir, `${base}.bak`);
  for (let n = 2; fs.existsSync(backupPath); n++) backupPath = path.join(dir, `${base}_${n}.bak`);

  fs.copyFileSync(filePath, backupPath, fs.constants.COPYFILE_EXCL);
  const hash = sha1(filePath);
  if (sha1(backupPath) !== hash) {
    fs.rmSync(backupPath, { force: true });
    throw new Error("Backup copy did not match the original; nothing was saved.");
  }
  return { backupPath, bytes: fs.statSync(backupPath).size, sha1: hash };
}

// Backup -> write temp file -> verify temp file -> replace original.
// `verify(tempPath, backup)` must resolve to { ok, problems[] }. The original is only
// replaced when the backup and the verification both succeed.
export async function safeSave(franchise, filePath, verify) {
  assertWritableSave(filePath);
  const backup = backupSave(filePath);
  const tempPath = backup.backupPath.replace(/\.bak$/, ".saving.tmp");

  try {
    await franchise.save(tempPath);
    const check = await verify(tempPath, backup);
    if (!check.ok) throw new Error(`Saved file failed verification: ${check.problems.join("; ")}`);
    if (sha1(filePath) !== backup.sha1) throw new Error("The source save changed while verifying the staged file; reopen it before trying again.");
    fs.renameSync(tempPath, filePath);
    return { savedPath: filePath, backup, check };
  } catch (e) {
    fs.rmSync(tempPath, { force: true });
    throw new Error(`${e.message} The original save was not changed. Backup: ${backup.backupPath}`);
  }
}
