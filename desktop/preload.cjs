const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "oarDesktop",
  Object.freeze({
    platform: process.platform,
    relay: (action, input) => ipcRenderer.invoke("oar:relay", action, input),
    roadmap: () => ipcRenderer.invoke("oar:roadmap"),
    runtimeLicenses: () => ipcRenderer.invoke("oar:runtime-licenses"),
    update: (action) => ipcRenderer.invoke("oar:update", action),
    onUpdate: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("oar:update-state", listener);
      return () => ipcRenderer.removeListener("oar:update-state", listener);
    },
    windowControl: (action) => ipcRenderer.invoke("oar:window-control", action),
    connection: () => ipcRenderer.invoke("oar:connection"),
    radioPorts: () => ipcRenderer.invoke("oar:radio-ports"),
    radioProfiles: () => ipcRenderer.invoke("oar:radio-profiles"),
    radioHistory: (radioId) => ipcRenderer.invoke("oar:radio-history", radioId),
    openRadioBackups: (radioId) => ipcRenderer.invoke("oar:radio-backup-folder", radioId),
    enrollRadio: (device, input) => ipcRenderer.invoke("oar:radio-enroll", device, input),
    backupUV5R: (device, radioId) => ipcRenderer.invoke("oar:radio-backup", device, radioId),
    radioPending: () => ipcRenderer.invoke("oar:radio-pending"),
    programUV5R: (device, row, slot, expectedSha, radioId) => ipcRenderer.invoke("oar:radio-program", device, row?.id, slot, expectedSha, JSON.stringify(row), `PROGRAM RADIO SLOT ${slot}`, radioId),
    verifyUV5R: (device) => ipcRenderer.invoke("oar:radio-verify", device),
    restoreUV5R: (device, slot) => ipcRenderer.invoke("oar:radio-restore", device, slot, `RESTORE RADIO SLOT ${slot}`),
    requestRadioPortAccess: (device) => ipcRenderer.invoke("oar:radio-port-access", device),
    toggleDemo: () => ipcRenderer.invoke("oar:demo-toggle"),
    loginSettings: (value, allowUnencrypted) =>
      ipcRenderer.invoke("oar:login-settings", value, allowUnencrypted),
    backup: () => ipcRenderer.invoke("oar:backup"),
    screenshot: () => ipcRenderer.invoke("oar:screenshot"),
    zoom: (factor) => ipcRenderer.invoke("oar:zoom", factor),
    zoomStep: (action) => ipcRenderer.invoke("oar:zoom-step", action),
    onZoomChanged: (callback) => {
      const listener = (_event, factor) => callback(factor);
      ipcRenderer.on("oar:zoom-changed", listener);
      return () => ipcRenderer.removeListener("oar:zoom-changed", listener);
    },
    savePdf: (data) => ipcRenderer.invoke("oar:save-pdf", data),
    documentFile: (action, kind, content, suggestedName) =>
      ipcRenderer.invoke("oar:document", action, kind, content, suggestedName),
    specialist: (command, id, bounds) =>
      ipcRenderer.invoke("oar:specialist", command, id, bounds),
    allowGeolocation: () => ipcRenderer.invoke("oar:geolocation"),
    copyCoordinates: (lat, lng) =>
      ipcRenderer.invoke("oar:coordinates", lat, lng),
    setOffline: (value) => ipcRenderer.invoke("oar:offline", value),
    request: (route, options) =>
      ipcRenderer.invoke("oar:request", route, options),
    exportLog: (name, text) => ipcRenderer.invoke("oar:export", name, text),
  }),
);
