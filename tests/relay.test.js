import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPublicKey, verify } from "node:crypto";
import { testVault } from "./relay-fixture.js";
import { parseRelaySettings } from "../shared/relayConfig.js";
import {
  ready,
  createIdentity,
  publicIdentity,
  validatePeer,
  sealMessage,
  openMessage,
  signedHeaders,
  hash,
} from "../desktop/relay-crypto.js";
import { RelayClient } from "../desktop/relay-client.js";
import { DatabaseSync } from "node:sqlite";
import { installRelayScopes } from "../server/relay-scope.js";

test("reused SQLite account IDs never inherit the previous private relay scope", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "PRAGMA foreign_keys=ON; CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1)",
    );
    const scope = installRelayScopes(db),
      first = scope(1);
    assert.match(first, /^[a-f0-9]{32}$/);
    assert.equal(installRelayScopes(db)(1), first);
    db.exec("DELETE FROM users WHERE id=1; INSERT INTO users VALUES(1)");
    assert.notEqual(scope(1), first);
    assert.equal(scope(2), null);
  } finally {
    db.close();
  }
});

test("relay YAML is strict, bounded and only permits HTTPS origins or explicit loopback development", () => {
  assert.deepEqual(
    parseRelaySettings("version: 1\nrelay:\n  url: https://relay.example/"),
    { version: 1, relay: { url: "https://relay.example" } },
  );
  for (const text of [
    "version: 1\nversion: 1\nrelay: {}",
    "version: 1\nrelay: {url: https://relay.example, adminKey: secret}",
    "version: 1\nrelay: {url: http://relay.example}",
    "version: 1\nrelay: {url: https://u:p@relay.example}",
    "version: 1\nrelay: {url: https://relay.example/path}",
    'version: 1\nrelay: {url: "https://relay.example/?secret=x"}',
    "version: 1\nrelay: {url: https://relay.example, enrollmentToken: tiny}",
    "a".repeat(8193),
  ])
    assert.throws(() => parseRelaySettings(text));
  assert.throws(() =>
    parseRelaySettings("version: 1\nrelay: {url: http://localhost:18443}"),
  );
  assert.equal(
    parseRelaySettings("version: 1\nrelay: {url: http://localhost:18443}", {
      allowLoopback: true,
    }).relay.url,
    "http://localhost:18443",
  );
});

test("HTTP testing accepts only loopback origins and keeps URL restrictions", () => {
  for (const url of [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://[::1]:8080",
  ]) {
    const yaml = JSON.stringify({ version: 1, relay: { url } });
    assert.throws(() => parseRelaySettings(yaml));
    assert.equal(
      parseRelaySettings(yaml, { allowLoopback: true }).relay.url,
      url,
    );
  }
  for (const url of [
    "http://192.168.1.2:8080",
    "http://relay.example",
    "http://localhost.example",
    "http://u:p@localhost:8080",
    "http://localhost:8080/path",
    "http://localhost:8080/?x=1",
    "http://localhost:8080/#x",
  ]) {
    assert.throws(() =>
      parseRelaySettings(JSON.stringify({ version: 1, relay: { url } }), {
        allowLoopback: true,
      }),
    );
  }
});

test("saved HTTP settings require opt-in again after restart and cannot start traffic without it", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "oar-loopback-"));
  let calls = 0;
  try {
    const options = {
      directory,
      storage: testVault(),
      secure: () => true,
      fetcher: async () => {
        calls++;
        throw Error("unexpected network");
      },
    };
    const enabled = new RelayClient({ ...options, allowLoopback: true });
    enabled.importSettings('version: 1\nrelay: {url: "http://localhost:8080"}');
    assert.equal(enabled.status(null).loopbackTesting, true);
    const disabled = new RelayClient(options);
    assert.equal(disabled.status(null).url, null);
    assert.match(disabled.status(null).error, /OAR_RELAY_ALLOW_LOOPBACK=1/);
    await assert.rejects(disabled.enable(1, true), /Import relay settings/);
    assert.equal(calls, 0);
    const restored = new RelayClient({ ...options, allowLoopback: true });
    assert.equal(restored.status(null).url, "http://localhost:8080");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("sodium envelopes authenticate peers/content/recipient, reject tampering and expiry; request signatures verify independently", async () => {
  await ready;
  const a = createIdentity(),
    b = createIdentity(),
    c = createIdentity(),
    peer = publicIdentity(a);
  validatePeer(peer, a.deviceId);
  assert.throws(() =>
    validatePeer({ ...peer, encryptionKey: c.encryptionKey }, a.deviceId),
  );
  assert.throws(
    () => sealMessage(a, publicIdentity(b), "\u0000".repeat(8192)),
    /encoding/,
  );
  const envelope = sealMessage(a, publicIdentity(b), "Private radio message");
  assert.equal(openMessage(b, peer, envelope), "Private radio message");
  assert.throws(() => openMessage(c, peer, envelope));
  assert.throws(() =>
    openMessage(b, peer, { ...envelope, recipientId: c.deviceId }),
  );
  assert.throws(() =>
    openMessage(b, peer, {
      ...envelope,
      ciphertext: envelope.ciphertext.slice(0, -2) + "AA",
    }),
  );
  assert.throws(() =>
    openMessage(b, peer, envelope, Date.now() + 8 * 86400000),
  );
  const body = '{"text":"example"}',
    origin = "https://relay.example",
    headers = signedHeaders(a, origin, "POST", "/v1/test", body);
  const canonical = [
    "OAR-REQUEST-V1",
    origin,
    headers["X-Oar-Timestamp"],
    headers["X-Oar-Nonce"],
    "POST",
    "/v1/test",
    hash(Buffer.from(body)),
  ].join("\n");
  const key = createPublicKey({
    format: "jwk",
    key: { kty: "OKP", crv: "Ed25519", x: a.signingKey },
  });
  assert.ok(
    verify(
      null,
      Buffer.from(canonical),
      key,
      Buffer.from(headers["X-Oar-Signature"], "base64url"),
    ),
  );
  assert.ok(
    !verify(
      null,
      Buffer.from(canonical.replace(origin, "https://other.example")),
      key,
      Buffer.from(headers["X-Oar-Signature"], "base64url"),
    ),
  );
});

test("import has no traffic, secrets stay sealed, identities persist per profile/origin and unavailable vault fails closed", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "oar-relay-"));
  let calls = 0;
  try {
    const storage = testVault(),
      options = {
        directory: path.join(directory, "state"),
        storage,
        secure: () => true,
        fetcher: async () => {
          calls++;
          throw Error("no network in test");
        },
      };
    const settings =
      "version: 1\nrelay:\n  url: https://relay.example\n  enrollmentToken: private-enrollment-test-credential";
    const source = path.join(directory, "settings.yaml");
    writeFileSync(source, settings, { mode: 0o600 });
    const client = new RelayClient(options);
    client.autoImport([source]);
    assert.equal(client.status(null).url, "https://relay.example");
    assert.equal(calls, 0);
    assert.equal(client.status(1).identity, null);
    assert.equal(client.status(1).enabled, false);
    const first = await client.enable(1, true);
    const second = await client.enable(2, true);
    assert.notEqual(first.identity.deviceId, second.identity.deviceId);
    assert.equal(calls, 0);
    const restored = new RelayClient(options);
    assert.equal(restored.status(1).identity.deviceId, first.identity.deviceId);
    for (const name of readdirSync(options.directory))
      assert.ok(
        !readFileSync(path.join(options.directory, name)).includes(
          Buffer.from("private-enrollment-test-credential"),
        ),
      );
    writeFileSync(source, "version: 1\nrelay: {url: https://other.example}");
    restored.autoImport([source]);
    assert.equal(restored.status(null).url, "https://relay.example");
    const context = client.context(1);
    client.pause();
    await assert.rejects(client.request(context, "GET", "/v1/messages"));
    assert.equal(calls, 0);
    restored.importSettings("version: 1\nrelay: {url: https://other.example}");
    assert.equal(restored.status(1).identity, null);
    assert.equal(restored.status(1).enabled, false);
    const locked = new RelayClient({ ...options, secure: () => false });
    assert.throws(() => locked.importSettings(settings));
    assert.equal(locked.status(null).secureStorage, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
