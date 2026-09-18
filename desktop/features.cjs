const { ipcMain, dialog, WebContentsView, session } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const sources = require("../shared/sources.json");
module.exports = function install({
  authorized,
  getWindow,
  isOffline,
  databasePath,
  onZoomInput,
}) {
  let view = null,
    current = null,
    geoUntil = 0;
  const watched = new WeakSet();
  const close = () => {
    if (view) {
      const win = getWindow();
      if (win && !win.isDestroyed()) win.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) view.webContents.close();
      view = null;
      current = null;
    }
  };
  ipcMain.handle("oar:document", async (event, action, kind, content) => {
    authorized(event);
    if (
      !["theme", "locations"].includes(kind) ||
      !["open", "save"].includes(action)
    )
      throw Error("Invalid document operation");
    const theme = kind === "theme",
      max = theme ? 256000 : 8000000,
      filters = [
        {
          name: theme ? "OAR theme YAML" : "OAR locations & contacts",
          extensions: theme ? ["yaml", "yml"] : ["json"],
        },
      ];
    if (action === "open") {
      const result = await dialog.showOpenDialog(getWindow(), {
        title: "Import " + kind,
        properties: ["openFile"],
        filters,
      });
      if (result.canceled) return { canceled: true };
      const file = result.filePaths[0];
      if ((await fs.stat(file)).size > max) throw Error("File is too large.");
      return {
        text: await fs.readFile(file, "utf8"),
        name: path.basename(file),
      };
    }
    if (typeof content !== "string" || Buffer.byteLength(content) > max)
      throw Error("Invalid export content");
    const result = await dialog.showSaveDialog(getWindow(), {
      title: "Export " + kind,
      defaultPath: theme ? "oar-theme.yaml" : "oar-locations.json",
      filters,
    });
    if (result.canceled) return { canceled: true };
    if (!(theme ? /\.ya?ml$/i : /\.json$/i).test(result.filePath))
      throw Error("Use the requested YAML or JSON file extension.");
    let target = path.resolve(result.filePath);
    try {
      target = await fs.realpath(target);
    } catch {}
    if (target === (await fs.realpath(databasePath())))
      throw Error("The active database cannot be overwritten.");
    const temporary =
      result.filePath +
      "." +
      require("node:crypto").randomBytes(8).toString("hex") +
      ".tmp";
    try {
      await fs.writeFile(temporary, content, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      await fs.rename(temporary, result.filePath);
    } finally {
      await fs.rm(temporary, { force: true });
    }
    return { path: result.filePath };
  });
  ipcMain.handle("oar:save-pdf", async (event, data) => {
    authorized(event);
    if (
      typeof data !== "string" ||
      data.length > 128 * 1024 * 1024 ||
      data.length % 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(data)
    )
      throw Error("Invalid PDF export.");
    const bytes = Buffer.from(data, "base64");
    if (bytes.subarray(0, 5).toString() !== "%PDF-")
      throw Error("Invalid PDF export.");
    const result = await dialog.showSaveDialog(getWindow(), {
      title: "Export ownership and warranty record",
      defaultPath: "oar-ownership.pdf",
      filters: [{ name: "PDF document", extensions: ["pdf"] }],
    });
    if (result.canceled) return { canceled: true };
    if (!/\.pdf$/i.test(result.filePath))
      throw Error("Choose a .pdf filename.");
    let target = path.resolve(result.filePath);
    try {
      target = await fs.realpath(target);
    } catch {}
    if (target === (await fs.realpath(databasePath())))
      throw Error("The active database cannot be overwritten.");
    const temp =
      result.filePath +
      "." +
      require("node:crypto").randomBytes(8).toString("hex") +
      ".tmp";
    try {
      await fs.writeFile(temp, bytes, { mode: 0o600, flag: "wx" });
      await fs.rename(temp, result.filePath);
    } finally {
      await fs.rm(temp, { force: true });
    }
    return { path: result.filePath };
  });
  ipcMain.handle("oar:geolocation", (event) => {
    authorized(event);
    geoUntil = Date.now() + 30000;
    return true;
  });
  ipcMain.handle("oar:specialist", async (event, command, id, bounds) => {
    authorized(event);
    if (command === "close") {
      close();
      return { ok: true };
    }
    if (command === "hide") {
      view?.setVisible(false);
      return { ok: true };
    }
    if (command === "status")
      return {
        loading: view?.webContents.isLoading() || false,
        url: view?.webContents.getURL() || "",
        error:
          view?.oarError ||
          (isOffline()
            ? "Specialist views require internet; offline mode is enabled."
            : ""),
      };
    const source = sources.find((s) => s.id === id);
    if (!source) throw Error("Unknown specialist view");
    if (isOffline()) {
      close();
      return {
        error:
          "Specialist views need an internet connection. Offline mode is enabled.",
      };
    }
    if (
      !bounds ||
      ["x", "y", "width", "height"].some((k) => !Number.isFinite(bounds[k]))
    )
      throw Error("Invalid view bounds");
    const win = getWindow(),
      [width, height] = win.getContentSize();
    const factor = win.webContents.getZoomFactor();
    const x = Math.max(0, Math.min(width - 1, Math.round(bounds.x * factor))),
      y = Math.max(
        Math.round(34 * factor),
        Math.min(height - 1, Math.round(bounds.y * factor)),
      );
    const box = {
      x,
      y,
      width: Math.max(
        1,
        Math.min(width - x, Math.round(bounds.width * factor)),
      ),
      height: Math.max(
        1,
        Math.min(height - y, Math.round(bounds.height * factor)),
      ),
    };
    if (current !== id) {
      close();
      current = id;
      const isolated = session.fromPartition("oar-specialists");
      isolated.setPermissionRequestHandler((_w, _p, cb) => cb(false));
      isolated.setPermissionCheckHandler(() => false);
      if (!isolated.oarDownloadGuard) {
        isolated.on("will-download", (e) => e.preventDefault());
        isolated.oarDownloadGuard = true;
      }
      isolated.webRequest.onBeforeRequest(
        { urls: ["<all_urls>"] },
        (details, callback) => {
          let blocked = isOffline();
          try {
            const url = new URL(details.url),
              host = url.hostname;
            blocked ||=
              ["file:", "oar:"].includes(url.protocol) ||
              /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[::1\]|\[f[cd]|\[fe80|172\.(1[6-9]|2\d|3[01])\.)/i.test(
                host,
              );
          } catch {
            blocked = true;
          }
          callback({ cancel: blocked });
        },
      );
      view = new WebContentsView({
        webPreferences: {
          session: isolated,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          allowRunningInsecureContent: false,
        },
      });
      if (onZoomInput) view.webContents.on("before-input-event", onZoomInput);
      const thisView = view;
      view.oarError = "";
      win.contentView.addChildView(view);
      view.setBounds(box);
      const allowed = (url) => {
        try {
          const u = new URL(url),
            root = new URL(source.url).hostname.replace(/^www\./, "");
          return (
            u.protocol === "https:" &&
            (u.hostname === root || u.hostname.endsWith("." + root))
          );
        } catch {
          return false;
        }
      };
      view.webContents.on("will-navigate", (e, url) => {
        if (!allowed(url)) e.preventDefault();
      });
      view.webContents.on("will-redirect", (e, url) => {
        if (!allowed(url)) e.preventDefault();
      });
      view.webContents.setWindowOpenHandler(({ url }) => {
        if (allowed(url)) thisView.webContents.loadURL(url).catch(() => {});
        return { action: "deny" };
      });
      view.webContents.on(
        "did-fail-load",
        (_e, code, description, _url, main) => {
          if (main && code !== -3)
            thisView.oarError = "This provider could not load: " + description;
        },
      );
      view.webContents.loadURL(source.url).catch((e) => {
        thisView.oarError = "This provider could not load: " + e.message;
      });
      if (!watched.has(win)) {
        watched.add(win);
        win.once("closed", close);
      }
    } else {
      view.setBounds(box);
      view.setVisible(true);
    }
    view.webContents.setZoomFactor(factor);
    if (command === "reload") {
      view.oarError = "";
      view.webContents.reload();
    }
    return { ok: true };
  });
  return {
    close,
    allowGeolocation: (contents) =>
      contents === getWindow()?.webContents && Date.now() < geoUntil,
  };
};
