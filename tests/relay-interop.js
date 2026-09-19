import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { RelayClient } from "../desktop/relay-client.js";
import { testVault } from "./relay-fixture.js";
const tokenFile = process.env.OAR_RELAY_TEST_TOKEN_FILE,
  origin = process.env.OAR_RELAY_TEST_ORIGIN;
if (!tokenFile || !origin)
  throw Error("Explicit disposable relay origin/token-file required.");
const root = mkdtempSync(path.join(os.tmpdir(), "oar-relay-interop-"));
const clients = [];
try {
  const settings = JSON.stringify({
    version: 1,
    relay: {
      url: origin,
      enrollmentToken: readFileSync(tokenFile, "utf8").trim(),
    },
  });
  const options = [1, 2].map((id) => ({
    directory: path.join(root, String(id)),
    storage: testVault(),
    secure: () => true,
    allowLoopback: true,
  }));
  const [a, b] = options.map((option) => new RelayClient(option));
  clients.push(a, b);
  for (const client of clients) {
    client.importSettings(settings);
    await client.enable(1, true);
    await client.sync(1);
  }
  const aId = a.status(1).identity.deviceId,
    bId = b.status(1).identity.deviceId;
  const bCard = await a.peer(1, bId),
    aCard = await b.peer(1, aId);
  await a.trust(1, bId, bCard.keySignature);
  await b.trust(1, aId, aCard.keySignature);
  await a.send(1, bId, "Private interoperability check");
  const envelope = a.context(1).state.outbox[0];
  assert.ok(
    !JSON.stringify(envelope).includes("Private interoperability check"),
  );
  await a.sync(1);
  await b.sync(1);
  assert.equal(a.status(1).pending, 0);
  assert.equal(b.status(1).messages[0].text, "Private interoperability check");
  const retry = await a.request(a.context(1), "POST", "/v1/messages", {
    recipientId: bId,
    envelope,
  });
  assert.equal(retry.id, envelope.id);
  const restarted = new RelayClient(options[1]);
  clients.push(restarted);
  await restarted.sync(1);
  assert.equal(restarted.status(1).identity.deviceId, bId);
  assert.equal(restarted.status(1).messages.length, 1);
  assert.equal(restarted.status(2).identity, null);
  assert.deepEqual(restarted.status(2).messages, []);
  console.log(
    "LIVE RELAY INTEROP PASSED: registration, signed directory/key binding, two pinned identities, encrypted send/pull/ack, post-ack retry, encrypted-state restart, profile isolation. OS vault mocked; UI/native keychain unverified.",
  );
} finally {
  for (const client of clients) client.pause();
  rmSync(root, { recursive: true, force: true });
}
