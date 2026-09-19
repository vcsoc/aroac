const {
  app,
  BrowserWindow,
  ipcMain,
  protocol,
  net,
  shell,
  safeStorage,
  dialog,
  clipboard,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { randomBytes, createHash } = require("node:crypto");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "oar",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
let win,
  config = {},
  sessionToken = null,
  authenticationSequence = 0,
  localServer,
  relayClient,
  db,
  localOrigin,
  closing = false;
const localKey = randomBytes(32).toString("hex");
const devUrl = !app.isPackaged ? process.env.OAR_DEV_URL : null;
const dataPath = () => path.join(app.getPath("userData"), "station.sqlite");
const settingsPath = () =>
  path.join(app.getPath("userData"), "local-session.json");
function canEncrypt() {
  return (
    safeStorage.isEncryptionAvailable() &&
    (!safeStorage.getSelectedStorageBackend ||
      safeStorage.getSelectedStorageBackend() !== "basic_text")
  );
}
function save() {
  const temp = settingsPath() + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(config), { mode: 0o600 });
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, settingsPath());
}
function storeSession() {
  delete config.session;
  delete config.sessionPlain;
  if (config.persistLogin && sessionToken) {
    if (canEncrypt())
      config.session = safeStorage
        .encryptString(sessionToken)
        .toString("base64");
    else if (config.allowUnencrypted) config.sessionPlain = sessionToken;
  }
  save();
}
function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    config =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    if (config.persistLogin === true && config.session && canEncrypt())
      sessionToken = safeStorage.decryptString(
        Buffer.from(config.session, "base64"),
      );
    if (
      config.persistLogin &&
      config.allowUnencrypted &&
      typeof config.sessionPlain === "string" &&
      /^[a-f0-9]{64}$/.test(config.sessionPlain)
    )
      sessionToken = config.sessionPlain;
  } catch {
    delete config.session;
    sessionToken = null;
  }
}
function authorized(event) {
  const url = event.senderFrame?.url || "";
  if (
    event.sender !== win?.webContents ||
    !(
      url.startsWith("oar://app/") ||
      (devUrl && new URL(url).origin === new URL(devUrl).origin)
    )
  )
    throw Error("Untrusted IPC sender");
}
function connection() {
  return {
    mode: "local",
    platform: process.platform,
    databasePath: dataPath(),
    persistentSession:
      !!config.persistLogin && (canEncrypt() || !!config.allowUnencrypted),
    secureSessionStorage: canEncrypt(),
    offline: !!config.offline,
  };
}
async function request(route, options = {}) {
  if (
    typeof route !== "string" ||
    !/^\/[a-z][a-z0-9/-]*(\?[^#\\]*)?$/.test(route) ||
    route.includes("..")
  )
    throw Error("Invalid API route");
  const method = options.method || "GET";
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method))
    throw Error("Invalid method");
  const body = options.body;
  if (
    body !== undefined &&
    (typeof body !== "string" ||
      Buffer.byteLength(body) >
        (["/library/import", "/library/preview", "/account/avatar"].includes(
          route,
        ) || /^\/devices\/\d+\/invoices$/.test(route)
          ? 8_000_000
          : route === "/sources"
            ? 256000
            : /^\/devices(?:\/\d+)?$/.test(route)
              ? 65536
              : 16384))
  )
    throw Error("Request too large");
  // Private, ephemeral loopback transport inside this Electron process. No separately
  // installed server, fixed port, user configuration or remote account service.
  const changesSession =
    method === "POST" && ["/login", "/register", "/logout"].includes(route);
  const sequence = changesSession
    ? ++authenticationSequence
    : authenticationSequence;
  const requestToken = sessionToken;
  const response = await net.fetch(localOrigin + "/api" + route, {
    method,
    body,
    credentials: "omit",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      "X-OAR-Client": "native",
      "X-OAR-Local-Key": localKey,
      ...(requestToken ? { Authorization: "Bearer " + requestToken } : {}),
    },
    signal: AbortSignal.timeout(route.startsWith("/repeaters") ? 65000 : 20000),
  });
  const data = await response.json();
  if (
    sequence !== authenticationSequence ||
    (requestToken !== sessionToken &&
      route !== "/login" &&
      route !== "/register")
  ) {
    if ((route === "/login" || route === "/register") && data.token)
      db.prepare("DELETE FROM sessions WHERE token=?").run(
        createHash("sha256").update(data.token).digest("hex"),
      );
    return {
      $oarError: {
        message: "Session changed. Retry in the current profile.",
        fields: {},
      },
    };
  }
  if (!response.ok)
    return {
      $oarError: {
        message: data.error || "Request failed",
        fields: data.fields || {},
      },
    };
  if ((route === "/login" || route === "/register") && data.token) {
    relayClient?.pause();
    sessionToken = data.token;
    storeSession();
    return data.user;
  }
  if (route === "/logout" || (route === "/me" && !data)) {
    relayClient?.pause();
    sessionToken = null;
    delete config.session;
    delete config.sessionPlain;
    save();
  }
  return data;
}
async function start() {
  fs.mkdirSync(app.getPath("userData"), { recursive: true, mode: 0o700 });
  const { createApp } = require("./generated/local-service.cjs");
  const service = createApp({
    dbPath: dataPath(),
    citiesPath: path.join(__dirname, "../data/cities.json"),
    sourcesPath: path.join(app.getPath("userData"), "sources.yaml"),
    defaultSourcesPath: path.join(__dirname, "../sources.yaml"),
    localKey,
    isOffline: () => !!config.offline,
  });
  db = service.db;
  localServer = service.app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    localServer.once("listening", resolve);
    localServer.once("error", reject);
  });
  localOrigin = "http://127.0.0.1:" + localServer.address().port;
  load();
  // Revoke abandoned process-only sessions, including after an unclean exit.
  if (
    sessionToken ||
    !config.persistLogin ||
    !(config.session || config.sessionPlain)
  )
    db.prepare("DELETE FROM sessions WHERE token != ?").run(
      sessionToken
        ? createHash("sha256").update(sessionToken).digest("hex")
        : "",
    );
  if (!config.persistLogin) storeSession();
  try {
    relayClient = require("./generated/relay.cjs").installRelay({
      app,
      db,
      ipcMain,
      dialog,
      authorized,
      request,
      canEncrypt,
      safeStorage,
      isOffline: () => !!config.offline,
      getWindow: () => win,
    });
  } catch {
    ipcMain.removeHandler("oar:relay");
    ipcMain.handle("oar:relay", (event) => {
      authorized(event);
      throw Error(
        "Optional relay could not initialize. Local OAR features remain available.",
      );
    });
  }
  protocol.handle("oar", (request) => {
    const url = new URL(request.url);
    const root = path.resolve(__dirname, "../dist");
    let file;
    try {
      file = path.resolve(root, "." + decodeURIComponent(url.pathname));
    } catch {
      return new Response("Bad path", { status: 400 });
    }
    if (
      url.host !== "app" ||
      !(file === root || file.startsWith(root + path.sep))
    )
      return new Response("Not found", { status: 404 });
    if (file === root) file = path.join(root, "index.html");
    return net.fetch(pathToFileURL(file).href);
  });
  require("./generated/updates.cjs")({
    authorized,
    getWindow: () => win,
    getConfig: () => config,
    save,
    backup: async (version) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      const directory = path.join(app.getPath("userData"), "backups");
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      fs.chmodSync(directory, 0o700);
      const filename = path.join(
        directory,
        `before-update-${version}-${Date.now()}.sqlite`,
      );
      db.prepare("VACUUM INTO ?").run(filename);
      fs.chmodSync(filename, 0o600);
      const sources = path.join(app.getPath("userData"), "sources.yaml");
      if (fs.existsSync(sources)) {
        fs.copyFileSync(sources, filename + ".sources.yaml");
        fs.chmodSync(filename + ".sources.yaml", 0o600);
      }
    },
  });
  const zoom = require("./zoom.cjs")({
    authorized,
    getWindow: () => win,
    getConfig: () => config,
    save,
  });
  const features = require("./features.cjs")({
    onZoomInput: zoom.input,
    authorized,
    getWindow: () => win,
    isOffline: () => !!config.offline,
    databasePath: dataPath,
  });
  ipcMain.handle("oar:connection", (event) => {
    authorized(event);
    return connection();
  });
  ipcMain.handle(
    "oar:login-settings",
    (event, value, allowUnencrypted = false) => {
      authorized(event);
      if (value !== undefined) {
        if (typeof value !== "boolean" || typeof allowUnencrypted !== "boolean")
          throw Error("Invalid login preference");
        if (value && !canEncrypt() && !allowUnencrypted)
          throw Error(
            "Confirm unencrypted session storage on this trusted device, or configure an OS secret store.",
          );
        config.persistLogin = value;
        config.allowUnencrypted = value && allowUnencrypted;
        storeSession();
      }
      return {
        persistLogin: !!config.persistLogin,
        secureStorage: canEncrypt(),
        allowUnencrypted: !!config.allowUnencrypted,
      };
    },
  );
  ipcMain.handle("oar:offline", (event, value) => {
    authorized(event);
    if (typeof value !== "boolean") throw Error("Invalid offline mode");
    config.offline = value;
    if (value) {
      features.close();
      relayClient?.pause();
    }
    save();
    return connection();
  });
  ipcMain.handle("oar:request", (event, route, options) => {
    authorized(event);
    return request(route, options);
  });
  ipcMain.handle("oar:coordinates", (event, lat, lng) => {
    authorized(event);
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    )
      throw Error("Invalid coordinates");
    clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    return { ok: true };
  });
  ipcMain.handle("oar:screenshot", async (event) => {
    authorized(event);
    const directory = app.getPath("pictures");
    fs.mkdirSync(directory, { recursive: true });
    const d = new Date(),
      pad = (n) => String(n).padStart(2, "0");
    const stamp =
      String(d.getFullYear()).slice(-2) +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) +
      pad(d.getHours()) +
      pad(d.getMinutes()) +
      pad(d.getSeconds());
    const filename = path.join(directory, "oar-screenshot-" + stamp + ".png");
    const image = await win.webContents.capturePage();
    if (image.isEmpty())
      throw Error("The application screenshot could not be captured.");
    try {
      fs.writeFileSync(filename, image.toPNG(), { flag: "wx", mode: 0o600 });
    } catch (e) {
      if (e.code === "EEXIST")
        throw Error(
          "A screenshot was already saved this second. Please try again.",
        );
      throw e;
    }
    return { path: filename };
  });
  ipcMain.handle("oar:backup", async (event) => {
    authorized(event);
    const current = await request("/me");
    if (!current?.id)
      throw Error("Sign in before exporting a private database backup.");
    if (db.prepare("SELECT COUNT(*) AS count FROM users").get().count > 1)
      throw Error(
        "Full database export is disabled for multi-profile installations to protect other profiles. Use your scoped locations/logbook export instead.",
      );
    const result = await dialog.showSaveDialog(win, {
      title: "Back up local OAR database",
      defaultPath:
        "OAR-backup-" + new Date().toISOString().slice(0, 10) + ".sqlite",
      filters: [{ name: "SQLite database", extensions: ["sqlite"] }],
    });
    if (result.canceled) return { canceled: true };
    let destination = path.resolve(result.filePath);
    try {
      destination = fs.realpathSync(destination);
    } catch {}
    if (destination === fs.realpathSync(dataPath()))
      throw Error(
        "Choose a different file; the active database cannot be overwritten.",
      );
    const temporary =
      result.filePath + "." + randomBytes(6).toString("hex") + ".tmp";
    try {
      db.prepare("VACUUM INTO ?").run(temporary);
      await fs.promises.chmod(temporary, 0o600);
      await fs.promises.rename(temporary, result.filePath);
      return { path: result.filePath };
    } finally {
      await fs.promises.rm(temporary, { force: true });
    }
  });
  ipcMain.handle("oar:export", async (event, name, text) => {
    authorized(event);
    if (
      typeof text !== "string" ||
      text.length > 5_000_000 ||
      name !== "oar-logbook.adi"
    )
      throw Error("Invalid export");
    const result = await dialog.showSaveDialog(win, {
      defaultPath: name,
      filters: [{ name: "ADIF logbook", extensions: ["adi"] }],
    });
    if (!result.canceled)
      await fs.promises.writeFile(result.filePath, text, "utf8");
  });
  ipcMain.handle("oar:runtime-licenses", async (event) => {
    authorized(event);
    const filename = path.join(
      path.dirname(process.execPath),
      "LICENSES.chromium.html",
    );
    if (!fs.existsSync(filename))
      throw Error("Chromium notices are not present in this package.");
    const error = await shell.openPath(filename);
    if (error) throw Error(error);
  });
  ipcMain.handle("oar:roadmap", async (event) => {
    authorized(event);
    const { fetchRoadmap } = await import("../shared/roadmap.js");
    return fetchRoadmap({
      offline: !!config.offline,
      fetcher: (url, options) => net.fetch(url, options),
    });
  });
  ipcMain.handle("oar:window-control", (event, action) => {
    authorized(event);
    if (action === "minimize") win.minimize();
    else if (action === "maximize")
      win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (action === "close") win.close();
    else throw Error("Invalid window action");
  });
  const create = () => {
    win = new BrowserWindow({
      title: "OAR · Open Amateur Radio",
      width: 1440,
      height: 1000,
      minWidth: 800,
      minHeight: 600,
      backgroundColor: "#101513",
      icon: path.join(__dirname, "../public/icon-512.png"),
      autoHideMenuBar: true,
      frame: !["win32", "darwin"].includes(process.platform),
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    zoom.attach(win);
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
      return { action: "deny" };
    });
    win.webContents.on("will-navigate", (event, url) => {
      if (url !== win.webContents.getURL()) {
        event.preventDefault();
        if (/^https?:\/\//.test(url)) shell.openExternal(url);
      }
    });
    win.webContents.session.setPermissionRequestHandler(
      (contents, permission, callback) =>
        callback(
          permission === "geolocation" && features.allowGeolocation(contents),
        ),
    );
    win.webContents.session.setPermissionCheckHandler(
      (contents, permission) =>
        permission === "geolocation" && features.allowGeolocation(contents),
    );
    win.webContents.session.webRequest.onBeforeRequest(
      { urls: ["http://*/*", "https://*/*"] },
      (details, callback) => {
        const local =
          details.url.startsWith(localOrigin + "/") ||
          (devUrl && details.url.startsWith(new URL(devUrl).origin + "/"));
        callback({ cancel: !!config.offline && !local });
      },
    );
    if (devUrl) win.loadURL(devUrl);
    else win.loadURL("oar://app/index.html");
  };
  create();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) create();
  });
}
function acquireInstance(attempt = 0) {
  if (!app.requestSingleInstanceLock()) {
    // AppImageUpdater starts the replacement just before the old process quits.
    // Allow its database shutdown to finish before taking the instance lock.
    if (
      process.platform === "linux" &&
      process.env.APPIMAGE_SILENT_INSTALL === "true" &&
      attempt < 40
    )
      setTimeout(() => acquireInstance(attempt + 1), 250);
    else app.quit();
    return;
  }
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
  app
    .whenReady()
    .then(start)
    .catch((error) => {
      dialog.showErrorBox(
        "OAR could not open your local station",
        error.message,
      );
      app.exit(1);
    });
}
acquireInstance();
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", (event) => {
  if (closing || !localServer) return;
  event.preventDefault();
  closing = true;
  if (
    sessionToken &&
    !(config.persistLogin && (config.session || config.sessionPlain))
  ) {
    db.prepare("DELETE FROM sessions WHERE token=?").run(
      createHash("sha256").update(sessionToken).digest("hex"),
    );
  }
  localServer.close(() => {
    db?.close();
    app.quit();
  });
  localServer.closeAllConnections();
});
