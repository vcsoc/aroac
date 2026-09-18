const { ipcMain } = require("electron");
module.exports = function installZoom({
  authorized,
  getWindow,
  getConfig,
  save,
}) {
  const value = () => {
    const v = getConfig().zoomFactor;
    return typeof v === "number" && Number.isFinite(v)
      ? Math.min(2, Math.max(0.6, v))
      : 1;
  };
  const apply = (next, persist = true) => {
    if (typeof next !== "number" || !Number.isFinite(next))
      throw Error("Invalid app zoom");
    const zoomFactor = Math.round(Math.min(2, Math.max(0.6, next)) * 100) / 100;
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.setZoomFactor(zoomFactor);
      win.webContents.send("oar:zoom-changed", zoomFactor);
    }
    if (persist) {
      getConfig().zoomFactor = zoomFactor;
      save();
    }
    return { zoomFactor };
  };
  const input = (event, input) => {
    if (
      input.type !== "keyDown" ||
      input.isAutoRepeat ||
      !(input.control || input.meta)
    )
      return;
    const k = input.key;
    if (["+", "=", "Add"].includes(k)) {
      event.preventDefault();
      apply(value() + 0.1);
    } else if (["-", "_", "Subtract"].includes(k)) {
      event.preventDefault();
      apply(value() - 0.1);
    } else if (k === "0") {
      event.preventDefault();
      apply(1);
    }
  };
  ipcMain.handle("oar:zoom-step", (event, action) => {
    authorized(event);
    if (!["in", "out", "reset"].includes(action))
      throw Error("Invalid zoom action");
    return apply(
      action === "reset" ? 1 : value() + (action === "in" ? 0.1 : -0.1),
    );
  });
  ipcMain.handle("oar:zoom", (event, next) => {
    authorized(event);
    return next === undefined ? { zoomFactor: value() } : apply(next);
  });
  return {
    input,
    attach: (win) => {
      win.webContents.on("before-input-event", input);
      win.webContents.on("did-finish-load", () => apply(value(), false));
      win.webContents.on("zoom-changed", (_event, direction) =>
        apply(value() + (direction === "in" ? 0.1 : -0.1)),
      );
    },
  };
};
