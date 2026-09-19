// Explicit test entry point; never included by the application packager.
const fs = require("node:fs"),
  crypto = require("node:crypto"),
  electron = require("electron");
if (!process.env.OAR_RELAY_FIXTURE_FILE)
  throw Error("Disposable fixture configuration required.");
const config = JSON.parse(
  fs.readFileSync(process.env.OAR_RELAY_FIXTURE_FILE, "utf8"),
);
// Restore OS defaults only for the explicit real-vault run: Playwright's
// loader otherwise forces insecure basic/mock storage before this entry point.
if (!config.allowMock) {
  electron.app.commandLine.removeSwitch("password-store");
  electron.app.commandLine.removeSwitch("use-mock-keychain");
}
const state = (globalThis.__relayFixture = {
  armed: false,
  pending: false,
  aborted: false,
  realSecure: false,
  backend: "unknown",
  mocked: false,
});
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const response = await originalFetch(url, options);
  if (
    state.armed &&
    url === config.origin + "/v1/messages" &&
    options.method === "POST" &&
    response.ok
  ) {
    state.armed = false;
    const body = await response.arrayBuffer(); // Relay already accepted the envelope.
    state.pending = true;
    return new Promise((resolve) => {
      const release = () => {
        state.pending = false;
        state.release = null;
        resolve(
          new Response(body, {
            status: response.status,
            headers: response.headers,
          }),
        );
      };
      state.release = release;
      options.signal.addEventListener(
        "abort",
        () => {
          state.aborted = true;
          release();
        },
        { once: true },
      );
      if (options.signal.aborted) {
        state.aborted = true;
        release();
      }
    });
  }
  return response;
};
electron.app.whenReady().then(() => {
  const storage = electron.safeStorage;
  state.backend = storage.getSelectedStorageBackend?.() || process.platform;
  state.realSecure =
    !config.allowMock &&
    storage.isEncryptionAvailable() &&
    state.backend !== "basic_text";
  if (config.allowMock) {
    state.mocked = true;
    const secret = Buffer.from(config.key, "hex");
    storage.isEncryptionAvailable = () => true;
    storage.getSelectedStorageBackend = () => "explicit-test-fixture";
    storage.encryptString = (text) => {
      const iv = crypto.randomBytes(12),
        cipher = crypto.createCipheriv("aes-256-gcm", secret, iv);
      const bytes = Buffer.concat([
        cipher.update(text, "utf8"),
        cipher.final(),
      ]);
      return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
    };
    storage.decryptString = (value) => {
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        secret,
        value.subarray(0, 12),
      );
      decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([
        decipher.update(value.subarray(28)),
        decipher.final(),
      ]).toString("utf8");
    };
  }
  electron.dialog.showOpenDialog = async () => ({
    canceled: false,
    filePaths: [config.settings],
  });
});
require("../../desktop/main.cjs");
