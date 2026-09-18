const { app, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("node:fs");
const path = require("node:path");
const createController = require("./update-controller.cjs");
module.exports = function setupUpdates({
  authorized,
  getWindow,
  getConfig,
  save,
  backup,
}) {
  autoUpdater.setFeedURL({
    provider: "github",
    owner: "vcsoc",
    repo: "oar",
    private: false,
    releaseType: "release",
  });
  const supported = () =>
    app.isPackaged &&
    ["x64", "arm64"].includes(process.arch) &&
    (process.platform === "linux"
      ? !!process.env.APPIMAGE
      : ["win32", "darwin"].includes(process.platform));
  // Preserve the owned data directory even for --user-data-dir launches.
  // electron-updater's AppImage restart hook otherwise passes no arguments.
  if (process.platform === "linux") {
    const spawn = autoUpdater.spawnLog.bind(autoUpdater);
    autoUpdater.spawnLog = (command, args = [], env, stdio) =>
      spawn(
        command,
        env?.APPIMAGE_SILENT_INSTALL === "true"
          ? [...args, "--user-data-dir=" + app.getPath("userData")]
          : args,
        env,
        stdio,
      ).catch((error) => {
        autoUpdater.emit("error", error);
        return false;
      });
  }
  let recoveryPath, originalPath;
  autoUpdater.on("error", (error) => {
    if (!recoveryPath) return;
    try {
      if (originalPath && !fs.existsSync(originalPath))
        fs.copyFileSync(recoveryPath, originalPath, fs.constants.COPYFILE_EXCL);
      error.message += " Previous executable recovery copy: " + recoveryPath;
    } catch (restoreError) {
      error.message +=
        " Recovery copy remains at " +
        recoveryPath +
        ": " +
        restoreError.message;
    }
  });
  const controller = createController({
    updater: autoUpdater,
    currentVersion: app.getVersion(),
    supported,
    supportReason: () =>
      process.platform === "linux"
        ? "Automatic installation requires the Linux AppImage. Extracted tar packages cannot replace themselves. Download the AppImage from GitHub Releases."
        : "Automatic updates require an installed release package for this OS and architecture. Windows and macOS builds also require platform testing and appropriate signing.",
    isOffline: () => !!getConfig().offline,
    getSkipped: () => getConfig().skippedUpdate,
    setSkipped: (version) => {
      getConfig().skippedUpdate = version;
      save();
    },
    backup: async (version) => {
      if (process.platform === "linux") {
        fs.accessSync(process.env.APPIMAGE, fs.constants.W_OK);
        fs.accessSync(path.dirname(process.env.APPIMAGE), fs.constants.W_OK);
        originalPath = process.env.APPIMAGE;
        recoveryPath = path.join(
          path.dirname(originalPath),
          `.oar-before-update-${app.getVersion()}-${Date.now()}.AppImage`,
        );
        try {
          fs.linkSync(originalPath, recoveryPath);
        } catch {
          fs.copyFileSync(
            originalPath,
            recoveryPath,
            fs.constants.COPYFILE_EXCL,
          );
        }
      }
      await backup(version);
    },
    publish: (state) => {
      const win = getWindow();
      if (win && !win.isDestroyed())
        win.webContents.send("oar:update-state", state);
    },
    restart: () => autoUpdater.quitAndInstall(false, true),
  });
  ipcMain.handle("oar:update", (event, action) => {
    authorized(event);
    return controller.command(action);
  });
  const timer = setTimeout(() => controller.check(false), 8000);
  timer.unref();
  return controller;
};
