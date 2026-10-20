const { app, BrowserWindow, Menu, dialog, ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const { pathToFileURL } = require("url");

const SAVES_DIR = path.join(os.homedir(), "Documents", "EA SPORTS College Football 27", "saves");

let mainWindow = null;
let session = null;

async function getSession() {
  if (!session) {
    const { Session } = await import(pathToFileURL(path.join(__dirname, "lib", "session.mjs")).href);
    session = new Session();
  }
  return session;
}

// Every handler returns { ok, result } or { ok:false, error } so the UI can show the message.
function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try { return { ok: true, result: await fn(...args) }; }
    catch (e) { return { ok: false, error: e?.message || String(e) }; }
  });
}

handle("ttt:choose-save", async () => {
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: "Open CFB 27 Dynasty Save",
    defaultPath: SAVES_DIR,
    properties: ["openFile"]
  });
  return picked.canceled ? null : picked.filePaths[0];
});
handle("ttt:open", async filePath => (await getSession()).open(filePath));
handle("ttt:save", async () => (await getSession()).save());
handle("ttt:draft-lock-preview", async () => (await getSession()).previewDraftLock());
handle("ttt:draft-lock-apply", async () => (await getSession()).applyDraftLock());
handle("ttt:depth-teams", async () => (await getSession()).depthTeams());
handle("ttt:depth-team", async teamIndex => (await getSession()).depthTeam(teamIndex));
handle("ttt:league-summary", async () => (await getSession()).leagueSummary());
handle("ttt:portal-players", async () => (await getSession()).portalPlayers());
handle("ttt:role-at", async (playerIndex, teamIndex) => (await getSession()).roleAt(playerIndex, teamIndex));
handle("ttt:who-wants-him", async playerIndex => (await getSession()).whoWantsHim(playerIndex));
handle("ttt:destinations", async playerIndex => (await getSession()).destinations(playerIndex));
handle("ttt:player-card", async playerIndex => (await getSession()).playerCard(playerIndex));

function createWindow() {
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1100, height: 800, minWidth: 800, minHeight: 600,
    title: "Tom's Transfer Tools",
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, "ui", "index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
