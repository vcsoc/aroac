import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RelayClient } from "../desktop/relay-client.js";

const settings = (url) => JSON.stringify({ version: 1, relay: { url } });
test("unavailable startup protects settings, explicit recovery reloads; failed encryption preserves ciphertext", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "oar-storage-failure-"));
  let available = true,
    failWrite = false;
  const storage = {
    encryptString: (text) => {
      if (failWrite) throw Error("vault denied");
      return Buffer.from(text);
    },
    decryptString: (bytes) => bytes.toString(),
  };
  const make = (allowLoopback) =>
    new RelayClient({
      directory,
      storage,
      secure: () => available,
      allowLoopback,
    });
  try {
    let client = make(true);
    client.importSettings(settings("http://localhost:18443"));
    const original = readFileSync(client.file("settings"));
    available = false;
    client = make(true);
    assert.throws(
      () => client.importSettings(settings("https://relay.example")),
      /will not be overwritten/,
    );
    assert.throws(() => client.retryStorage(null), /unavailable/);
    assert.deepEqual(readFileSync(client.file("settings")), original);
    available = true;
    client.retryStorage(null);
    assert.equal(client.configuration.relay.url, "http://localhost:18443");
    // Decryption succeeds, but current URL policy disallows saved loopback URL.
    client = make(false);
    assert.equal(client.configuration, null);
    failWrite = true;
    assert.throws(
      () => client.importSettings(settings("https://relay.example")),
      /vault denied/,
    );
    assert.deepEqual(readFileSync(client.file("settings")), original);
    failWrite = false;
    client.importSettings(settings("https://relay.example"));
    assert.equal(client.configuration.relay.url, "https://relay.example");
    assert.equal(client.status(null).enabled, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
