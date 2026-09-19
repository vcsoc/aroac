// Run directly with Electron, NEVER via Playwright's injected loader.
const { app, safeStorage } = require("electron");
const fs = require("node:fs"),
  path = require("node:path");
const directory = process.env.OAR_VAULT_PROBE_DIRECTORY;
if (!directory) throw Error("Explicit disposable probe directory required.");
app.setName("oar");
app.setPath("userData", directory);
app.whenReady().then(() => {
  const backend = safeStorage.getSelectedStorageBackend?.() || process.platform;
  const available =
    safeStorage.isEncryptionAvailable() && backend !== "basic_text";
  const result = {
    app: app.getName(),
    backend,
    available,
    passwordStore:
      app.commandLine.getSwitchValue("password-store") || "OS default",
    mockKeychain: app.commandLine.hasSwitch("use-mock-keychain"),
  };
  if (!available) {
    console.log(
      JSON.stringify({
        ...result,
        result: "SKIP: no secure backend; no encrypt/decrypt attempted",
      }),
    );
    app.exit(0);
    return;
  }
  try {
    const file = path.join(directory, "probe.sealed"),
      marker = "OAR disposable vault round-trip test";
    const restart = fs.existsSync(file);
    if (!restart)
      fs.writeFileSync(file, safeStorage.encryptString(marker), {
        mode: 0o600,
        flag: "wx",
      });
    if (safeStorage.decryptString(fs.readFileSync(file)) !== marker)
      throw Error();
    console.log(
      JSON.stringify({
        ...result,
        result: restart
          ? "PASS: cross-process decrypt"
          : "PASS: encrypt/decrypt",
      }),
    );
    app.exit(0);
  } catch {
    console.log(
      JSON.stringify({ ...result, result: "FAIL: OS vault round-trip" }),
    );
    app.exit(1);
  }
});
