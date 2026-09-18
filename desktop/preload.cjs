const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "oarDesktop",
  Object.freeze({
    platform: process.platform,
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
    documentFile: (action, kind, content) =>
      ipcRenderer.invoke("oar:document", action, kind, content),
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
