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
const {
  configureCredentialStorage,
  createCredentialStorage,
} = require("./credential-storage.cjs");
configureCredentialStorage(app);
const credentialStorage = createCredentialStorage(safeStorage);
const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { withVerifiedBackup } = require("./uv5r.cjs");
const { programOne, pendingStatus, verifyPending, restorePending } = require("./uv5r-session.cjs");
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
  demo = null,
  switchingDemo = false,
  workspaceGeneration = 0,
  closing = false,
  radioBusy = false;
const localKey = randomBytes(32).toString("hex");
const devUrl = !app.isPackaged ? process.env.OAR_DEV_URL : null;
const dataPath = () => path.join(app.getPath("userData"), "station.sqlite");
const settingsPath = () =>
  path.join(app.getPath("userData"), "local-session.json");
function canEncrypt() {
  return credentialStorage.available();
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
    // New profiles default to persistent sign-in only when a secure OS vault is available.
    // An explicit opt-out (false) is never overwritten, and plaintext needs consent.
    if (!Object.hasOwn(config, "persistLogin") && canEncrypt())
      config.persistLogin = true;
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
    if (!Object.hasOwn(config, "persistLogin") && canEncrypt())
      config.persistLogin = true;
  }
}
function authorized(event) {
  const url = event.senderFrame?.url || "";
  if (
    event.sender !== win?.webContents ||
    !(
      url.startsWith("oar://app/") ||
      url.startsWith("oar://demo/") ||
      (devUrl && new URL(url).origin === new URL(devUrl).origin)
    )
  )
    throw Error("Untrusted IPC sender");
}
function listRadioPorts() {
  if (process.platform !== "linux") return [];
  try {
    return fs.readdirSync("/dev/serial/by-id").slice(0, 32).flatMap((name) => {
      const pathToPort = fs.realpathSync(path.join("/dev/serial/by-id", name));
      if (!/^\/dev\/tty(?:USB|ACM)\d+$/.test(pathToPort)) return [];
      let accessible = true;
      try { fs.accessSync(pathToPort, fs.constants.R_OK | fs.constants.W_OK); }
      catch { accessible = false; }
      return [{ name: name.slice(0, 100), path: pathToPort, accessible }];
    });
  } catch { return []; }
}
function connection() {
  return {
    mode: "local",
    platform: process.platform,
    databasePath: demo ? "In-memory demo (discarded on exit)" : dataPath(),
    demo: !!demo,
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
  if (switchingDemo) throw Error("Workspace is switching. Try again.");
  const generation = workspaceGeneration;
  const activeDemo = demo;
  const requestToken = activeDemo ? activeDemo.token : sessionToken;
  const response = await net.fetch(
    (activeDemo?.origin ?? localOrigin) + "/api" + route,
    {
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
      signal: AbortSignal.timeout(
        route.startsWith("/repeaters") ? 65000 : 20000,
      ),
    },
  );
  const data = await response.json();
  if (
    generation !== workspaceGeneration ||
    sequence !== authenticationSequence ||
    (requestToken !== (activeDemo ? activeDemo.token : sessionToken) &&
      route !== "/login" &&
      route !== "/register")
  ) {
    if ((route === "/login" || route === "/register") && data.token)
      (activeDemo?.db ?? db)
        .prepare("DELETE FROM sessions WHERE token=?")
        .run(createHash("sha256").update(data.token).digest("hex"));
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
    if (activeDemo) activeDemo.token = data.token;
    else {
      relayClient?.pause();
      sessionToken = data.token;
      storeSession();
    }
    return data.user;
  }
  if (route === "/logout" || (route === "/me" && !data)) {
    if (activeDemo) activeDemo.token = null;
    else {
      relayClient?.pause();
      sessionToken = null;
      delete config.session;
      delete config.sessionPlain;
      save();
    }
  }
  return data;
}
async function start() {
  fs.mkdirSync(app.getPath("userData"), { recursive: true, mode: 0o700 });
  const { createApp } = require("./generated/local-service.cjs");
  const serviceOptions = {
    dbPath: dataPath(),
    citiesPath: path.join(__dirname, "../data/cities.json"),
    sourcesPath: path.join(app.getPath("userData"), "sources.yaml"),
    defaultSourcesPath: path.join(__dirname, "../sources.yaml"),
    localKey,
    isOffline: () => !!config.offline,
  };
  const service = createApp(serviceOptions);
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
      authorized: (event) => {
        authorized(event);
        if (demo) throw Error("Relay is unavailable in demo mode.");
      },
      request,
      canEncrypt,
      safeStorage: credentialStorage,
      storageStatus: credentialStorage.status,
      isOffline: () => !!config.offline,
      getWindow: () => win,
    });
  } catch {
    ipcMain.removeHandler("oar:relay");
    ipcMain.handle("oar:relay", (event) => {
      authorized(event);
      throw Error(
        "Optional relay could not initialize. Local AROAC features remain available.",
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
      !["app", "demo"].includes(url.host) ||
      !(file === root || file.startsWith(root + path.sep))
    )
      return new Response("Not found", { status: 404 });
    if (file === root) file = path.join(root, "index.html");
    return net.fetch(pathToFileURL(file).href);
  });
  require("./generated/updates.cjs")({
    authorized: (event) => {
      authorized(event);
      if (demo) throw Error("Updates are unavailable in demo mode.");
    },
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
    authorized: (event) => {
      authorized(event);
      if (demo)
        throw Error(
          "External files and specialist views are unavailable in demo mode.",
        );
    },
    getWindow: () => win,
    isOffline: () => !!config.offline,
    databasePath: dataPath,
  });
  async function toggleDemo() {
    if (radioBusy) throw Error("Wait for the radio operation to finish before switching workspaces.");
    if (switchingDemo || !win || win.isDestroyed()) return;
    switchingDemo = true;
    workspaceGeneration++;
    authenticationSequence++;
    try {
      features.close();
      relayClient?.pause();
      if (demo) {
        const old = demo;
        demo = null;
        await new Promise((resolve) => {
          old.server.close(resolve);
          old.server.closeAllConnections();
        });
        old.db.close();
        // Custom-scheme storage origin filters can clear the primary profile too.
        // Clear only the currently loaded demo page's browser preferences.
        if (win.webContents.getURL().startsWith("oar://demo/"))
          await win.webContents
            .executeJavaScript("localStorage.clear(); sessionStorage.clear();")
            .catch(() => {});
      } else {
        const sample = require("./demo.cjs").createDemo(
          createApp,
          serviceOptions,
        );
        const server = sample.app.listen(0, "127.0.0.1");
        await new Promise((resolve, reject) => {
          server.once("listening", resolve);
          server.once("error", reject);
        });
        demo = {
          ...sample,
          server,
          origin: "http://127.0.0.1:" + server.address().port,
        };
      }
      if (devUrl && !demo) await win.loadURL(devUrl);
      else
        await win.loadURL("oar://" + (demo ? "demo" : "app") + "/index.html");
    } finally {
      switchingDemo = false;
    }
  }
  ipcMain.handle("oar:demo-toggle", async (event) => {
    authorized(event);
    await toggleDemo();
  });
  ipcMain.handle("oar:connection", (event) => {
    authorized(event);
    return connection();
  });
  ipcMain.handle("oar:radio-ports", (event) => {
    authorized(event);
    return listRadioPorts();
  });
  const radioDirectory = () => path.join(app.getPath("userData"), "radio-backups");
  const radioPendingFile = () => path.join(app.getPath("userData"), "radio-pending.json");
  async function radioOperator(event) {
    authorized(event);
    if (demo) throw Error("Radio operations are disabled in demo mode.");
    const user = await request("/me");
    if (!Number.isSafeInteger(user?.id)) throw Error("Sign in before accessing private radio memories.");
    return user;
  }
  async function radioWithPort(event, device, operation) {
    const user = await radioOperator(event);
    const port = listRadioPorts().find((entry) => entry.path === device && entry.accessible);
    if (!port) throw Error("Choose a currently accessible USB-serial cable.");
    if (radioBusy) throw Error("A radio operation is already running.");
    radioBusy = true;
    try { return await operation(user, port); }
    finally { radioBusy = false; }
  }
  ipcMain.handle("oar:radio-backup", (event, device) =>
    radioWithPort(event, device, async (_user, port) =>
      withVerifiedBackup(port.path, radioDirectory(), async ({ backup }) => backup)));
  ipcMain.handle("oar:radio-pending", async (event) => {
    const user = await radioOperator(event);
    return pendingStatus(radioPendingFile(), user.id);
  });
  ipcMain.handle("oar:radio-program", (event, device, id, slot, expectedSha, expectedRow, confirmation) =>
    radioWithPort(event, device, async (user, port) => {
      if (!Number.isSafeInteger(id) || confirmation !== `PROGRAM RADIO SLOT ${slot}`)
        throw Error("Explicit confirmation of the selected radio memory slot is required.");
      const list = await request("/radio-channels");
      const row = Array.isArray(list) ? list.find((entry) => entry.id === id) : null;
      const { canExportChannel } = await import("../shared/radioProgramming.js");
      if (!row || !canExportChannel(row)) throw Error("Channel is not privately saved and independently verified for analog programming.");
      if (typeof expectedRow !== "string" || expectedRow.length > 5_000 || expectedRow !== JSON.stringify(row))
        throw Error("Radio channel settings changed after your confirmation. Review them again; no write was sent.");
      return programOne({ device: port.path, directory: radioDirectory(), pendingPath: radioPendingFile(),
        owner: user.id, cable: port.name, row, slot, expectedSha, beforeWrite: async () => {
          const currentUser = await request("/me");
          const currentRows = await request("/radio-channels");
          if (demo || currentUser?.id !== user.id ||
              !Array.isArray(currentRows) || JSON.stringify(currentRows.find((entry) => entry.id === id)) !== expectedRow)
            throw Error("Signed-in profile or radio channel settings changed during backup. No write was sent.");
        } });
    }));
  ipcMain.handle("oar:radio-verify", (event, device) =>
    radioWithPort(event, device, (user, port) => verifyPending({ device: port.path,
      directory: radioDirectory(), pendingPath: radioPendingFile(), owner: user.id, cable: port.name })));
  ipcMain.handle("oar:radio-restore", (event, device, slot, confirmation) =>
    radioWithPort(event, device, (user, port) => {
      if (!Number.isInteger(slot) || confirmation !== `RESTORE RADIO SLOT ${slot}`)
        throw Error("Explicit confirmation of the original slot and backup is required.");
      const pending = pendingStatus(radioPendingFile(), user.id);
      if (!pending || pending.slot !== slot) throw Error("No matching pending channel restoration.");
      return restorePending({ device: port.path, directory: radioDirectory(), pendingPath: radioPendingFile(), owner: user.id, cable: port.name });
    }));
  ipcMain.handle("oar:radio-port-access", (event, device) => {
    authorized(event);
    if (demo) throw Error("USB cable access is not available in demo mode.");
    const port = listRadioPorts().find((entry) => entry.path === device);
    if (!port) throw Error("Choose a currently connected USB-serial cable.");
    if (port.accessible) return Promise.resolve(port);
    if (!fs.existsSync("/usr/bin/pkexec") || !fs.existsSync("/usr/bin/setfacl"))
      throw Error("OS authorization tools are unavailable; ask your administrator for permission to access this cable.");
    return new Promise((resolve, reject) => {
      execFile("/usr/bin/pkexec", ["/usr/bin/setfacl", "-m", `u:${process.getuid()}:rw`, port.path], { timeout: 60000 }, (error) => {
        if (error) return reject(Error("OS authorization was cancelled or unsuccessful; cable permissions were not changed."));
        const updated = listRadioPorts().find((entry) => entry.path === port.path);
        if (!updated?.accessible) return reject(Error("Serial cable is still inaccessible. Try reconnecting it or checking system permissions."));
        resolve(updated);
      });
    });
  });
  ipcMain.handle(
    "oar:login-settings",
    (event, value, allowUnencrypted = false) => {
      authorized(event);
      if (demo && value !== undefined)
        throw Error("Login preferences cannot be changed in demo mode.");
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
    if (demo) throw Error("Offline preference cannot be changed in demo mode.");
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
    if (demo) throw Error("Screenshot files are unavailable in demo mode.");
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
    const filename = path.join(directory, "aroac-screenshot-" + stamp + ".png");
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
    if (demo) throw Error("Database backup is unavailable in demo mode.");
    const current = await request("/me");
    if (!current?.id)
      throw Error("Sign in before exporting a private database backup.");
    if (db.prepare("SELECT COUNT(*) AS count FROM users").get().count > 1)
      throw Error(
        "Full database export is disabled for multi-profile installations to protect other profiles. Use your scoped locations/logbook export instead.",
      );
    const result = await dialog.showSaveDialog(win, {
      title: "Back up local AROAC database",
      defaultPath:
        "AROAC-backup-" + new Date().toISOString().slice(0, 10) + ".sqlite",
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
    if (demo) throw Error("File export is unavailable in demo mode.");
    if (
      typeof text !== "string" ||
      text.length > 5_000_000 ||
      !["aroac-logbook.adi", "aroac-verified-radio-memories.csv"].includes(name)
    )
      throw Error("Invalid export");
    const result = await dialog.showSaveDialog(win, {
      defaultPath: name,
      filters: name.endsWith(".csv")
        ? [{ name: "Radio memory CSV", extensions: ["csv"] }]
        : [{ name: "ADIF logbook", extensions: ["adi"] }],
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
      title: "AROAC · Amateur Radio Operations and Communications",
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
    win.on("close", (event) => {
      if (radioBusy) {
        event.preventDefault();
        dialog.showErrorBox("Radio operation in progress", "Wait for the radio operation to finish. Do not unplug the cable or turn off the radio during a write.");
      }
    });
    zoom.attach(win);
    win.webContents.on("before-input-event", (event, input) => {
      if (
        input.type === "keyDown" &&
        !input.isAutoRepeat &&
        input.control &&
        input.alt &&
        input.shift &&
        input.key.toLowerCase() === "d"
      ) {
        event.preventDefault();
        toggleDemo().catch((error) =>
          dialog.showErrorBox("Demo workspace", error.message),
        );
      }
    });
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
        "AROAC could not open your local station",
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
  if (radioBusy) { event.preventDefault(); return; }
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
  const finish = () =>
    localServer.close(() => {
      db?.close();
      app.quit();
    });
  if (demo) {
    demo.server.close(() => {
      demo.db.close();
      finish();
    });
    demo.server.closeAllConnections();
  } else finish();
  localServer.closeAllConnections();
});
