import fs from "node:fs";
import path from "node:path";
import { RelayClient } from "./relay-client.js";
import { installRelayScopes } from "../server/relay-scope.js";
export function installRelay({
  app,
  db,
  ipcMain,
  dialog,
  authorized,
  request,
  canEncrypt,
  safeStorage,
  isOffline,
  getWindow,
}) {
  const localScope = installRelayScopes(db);
  const client = new RelayClient({
    directory: path.join(app.getPath("userData"), "private-relay"),
    storage: safeStorage,
    secure: canEncrypt,
    offline: isOffline,
    allowLoopback:
      !app.isPackaged && process.env.OAR_RELAY_ALLOW_LOOPBACK === "1",
  });
  client.autoImport([
    path.join(app.getPath("userData"), "settings.yaml"),
    ...(process.env.APPIMAGE
      ? [path.join(path.dirname(process.env.APPIMAGE), "settings.yaml")]
      : []),
    path.join(path.dirname(app.getPath("exe")), "settings.yaml"),
    path.join(process.resourcesPath, "settings.yaml"),
  ]);
  const profile = async () => {
    const user = await request("/me");
    return Number.isSafeInteger(user?.id) ? localScope(user.id) : null;
  };
  ipcMain.handle("oar:relay", async (event, action, input = {}) => {
    authorized(event);
    const owner = await profile();
    if (action === "status") return client.status(owner);
    if (action === "import") {
      const result = await dialog.showOpenDialog(getWindow(), {
        title: "Import relay settings.yaml",
        properties: ["openFile"],
        filters: [{ name: "YAML settings", extensions: ["yaml", "yml"] }],
      });
      if (result.canceled) return client.status(owner);
      if ((await profile()) !== owner) throw Error("Session changed.");
      const file = result.filePaths[0],
        info = fs.statSync(file);
      if (!info.isFile() || info.size > 8192)
        throw Error("Choose a YAML file no larger than 8 KiB.");
      return client.importSettings(fs.readFileSync(file, "utf8"));
    }
    if (!owner) throw Error("Sign in before using private relay messaging.");
    if (!input || input.origin !== client.configuration?.relay.url)
      throw Error("Relay settings changed. Refresh before continuing.");
    let result;
    if (action === "enable") {
      await client.enable(owner, input.enabled);
      if (input.enabled) await client.sync(owner);
      result = client.status(owner);
    } else if (action === "peer")
      result = await client.peer(owner, input.deviceId);
    else if (action === "trust")
      result = await client.trust(owner, input.deviceId, input.keySignature);
    else if (action === "send")
      result = await client.send(owner, input.deviceId, input.text);
    else if (action === "discard") {
      await client.discard(owner, input.ids);
      result = client.status(owner);
    } else if (action === "sync") {
      await client.sync(owner);
      result = client.status(owner);
    } else throw Error("Unknown relay action.");
    if ((await profile()) !== owner) throw Error("Session changed.");
    return result;
  });
  let running = false;
  const timer = setInterval(async () => {
    if (running || isOffline()) return;
    running = true;
    try {
      const owner = await profile();
      if (owner && client.status(owner).enabled) await client.sync(owner);
    } catch {
      /* Never log credentials or message content. Manual sync reports failures. */
    } finally {
      running = false;
    }
  }, 45000);
  timer.unref();
  app.once("before-quit", () => {
    clearInterval(timer);
    client.pause();
  });
  return client;
}
