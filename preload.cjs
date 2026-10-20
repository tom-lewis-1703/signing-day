const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ttt", {
  chooseSave: () => ipcRenderer.invoke("ttt:choose-save"),
  open: filePath => ipcRenderer.invoke("ttt:open", filePath),
  save: () => ipcRenderer.invoke("ttt:save"),
  draftLockPreview: () => ipcRenderer.invoke("ttt:draft-lock-preview"),
  draftLockApply: () => ipcRenderer.invoke("ttt:draft-lock-apply"),
  depthTeams: () => ipcRenderer.invoke("ttt:depth-teams"),
  depthTeam: teamIndex => ipcRenderer.invoke("ttt:depth-team", teamIndex),
  leagueSummary: () => ipcRenderer.invoke("ttt:league-summary"),
  portalPlayers: () => ipcRenderer.invoke("ttt:portal-players"),
  roleAt: (playerIndex, teamIndex) => ipcRenderer.invoke("ttt:role-at", playerIndex, teamIndex),
  whoWantsHim: playerIndex => ipcRenderer.invoke("ttt:who-wants-him", playerIndex),
  destinations: playerIndex => ipcRenderer.invoke("ttt:destinations", playerIndex)
});
