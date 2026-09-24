import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import policy from "../desktop/credential-storage.cjs";
import { RelayClient } from "../desktop/relay-client.js";

const { configureCredentialStorage, createCredentialStorage } = policy;
test("pre-ready backend policy respects native platforms, explicit choices and KDE aliases", () => {
  for (const [platform, env, explicit, expected] of [
    ["linux", { XDG_CURRENT_DESKTOP: "Hyprland" }, false, "gnome-libsecret"],
    ["linux", {}, false, "gnome-libsecret"],
    ["linux", { XDG_CURRENT_DESKTOP: "GNOME" }, false, "gnome-libsecret"],
    ["linux", { XDG_CURRENT_DESKTOP: "foo:kDe" }, false, null],
    ["linux", { DESKTOP_SESSION: "plasmawayland" }, false, null],
    ["linux", { KDE_FULL_SESSION: "true" }, false, null],
    ["linux", { KDE_SESSION_VERSION: "6" }, false, null],
    ["linux", {}, true, null],
    ["darwin", {}, false, null],
    ["win32", {}, false, null],
  ]) {
    let selected = null;
    configureCredentialStorage(
      {
        commandLine: {
          hasSwitch: () => explicit,
          appendSwitch: (key, value) => {
            assert.equal(key, "password-store");
            selected = value;
          },
        },
      },
      platform,
      env,
    );
    assert.equal(selected, expected);
  }
});
test("diagnostics fail closed, redact OS errors and avoid Linux-only API on other platforms", () => {
  for (const platform of ["darwin", "win32"]) {
    const store = createCredentialStorage(
      {
        isEncryptionAvailable: () => true,
        getSelectedStorageBackend: () => {
          throw Error("Linux only");
        },
      },
      platform,
    );
    assert.equal(store.available(), true);
  }
  const raw = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => "basic_text",
    encryptString: () => {
      throw Error("sensitive path");
    },
  };
  const store = createCredentialStorage(raw, "linux");
  assert.equal(store.available(), false);
  assert.throws(() => store.encryptString("secret"), /unavailable/);
  raw.getSelectedStorageBackend = () => "gnome_libsecret";
  assert.throws(() => store.encryptString("secret"), /could not protect/);
  assert.equal(store.status().failure, "encrypt");
  assert.doesNotMatch(store.status().message, /sensitive path|secret$/);
});
test("locked settings and profile survive recovery without overwrite, repeated prompts or new identity", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "oar-vault-recovery-"));
  let locked = false,
    reads = 0;
  const storage = createCredentialStorage(
    {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => "gnome_libsecret",
      encryptString: (text) => Buffer.from(text),
      decryptString: (bytes) => {
        reads++;
        if (locked) throw Error("locked");
        return bytes.toString();
      },
    },
    "linux",
  );
  const make = () =>
    new RelayClient({
      directory,
      storage,
      secure: storage.available,
      storageStatus: storage.status,
    });
  try {
    let client = make();
    client.importSettings("version: 1\nrelay: {url: https://relay.example}");
    const context = client.context(1);
    context.state.identity = { sentinel: "original identity" };
    client.write(context.key, context.state);
    const settings = readFileSync(client.file("settings"));
    const profile = readFileSync(client.file(context.key));
    locked = true;
    client = make();
    assert.throws(
      () =>
        client.importSettings(
          "version: 1\nrelay: {url: https://other.example}",
        ),
      /will not be overwritten/,
    );
    client.autoImport([]);
    for (let i = 0; i < 4; i++) client.status(null);
    assert.equal(reads, 1);
    assert.deepEqual(readFileSync(client.file("settings")), settings);
    locked = false;
    client.retryStorage(null);
    assert.equal(client.configuration.relay.url, "https://relay.example");
    locked = true;
    assert.match(client.status(1).error, /could not unlock/);
    const count = reads;
    client.status(1);
    client.status(1);
    assert.equal(reads, count);
    assert.throws(() => client.context(1), /remains locked/);
    locked = false;
    client.retryStorage(null);
    assert.deepEqual(client.context(1).state.identity, {
      sentinel: "original identity",
    });
    assert.equal(client.context(1).state.consent, false);
    assert.deepEqual(readFileSync(client.file(context.key)), profile);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
