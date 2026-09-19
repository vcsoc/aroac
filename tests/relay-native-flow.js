import { _electron, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { RelayClient } from "../desktop/relay-client.js";
import { testVault } from "./relay-fixture.js";
const origin = process.env.OAR_RELAY_TEST_ORIGIN,
  tokenFile = process.env.OAR_RELAY_TEST_TOKEN_FILE;
if (!origin || !tokenFile)
  throw Error("Disposable relay origin/token file required.");
const root = mkdtempSync(path.join(os.tmpdir(), "oar-native-flow-")),
  data = path.join(root, "app"),
  file = path.join(root, "provision.yaml"),
  fixture = path.join(root, "fixture.json");
const settings = JSON.stringify({
  version: 1,
  relay: {
    url: origin,
    enrollmentToken: readFileSync(tokenFile, "utf8").trim(),
  },
});
writeFileSync(file, settings, { mode: 0o600 });
writeFileSync(
  fixture,
  JSON.stringify({
    origin,
    settings: file,
    allowMock: process.env.OAR_RELAY_TEST_MOCK_VAULT === "1",
    key: randomBytes(32).toString("hex"),
  }),
  { mode: 0o600 },
);
let app, peer;
const launch = () =>
  _electron.launch({
    args: ["tests/fixtures/relay-main.cjs", "--user-data-dir=" + data],
    env: {
      ...process.env,
      OAR_DEV_URL: "",
      OAR_SERVER_URL: "",
      OAR_RELAY_ALLOW_LOOPBACK: "1",
      OAR_RELAY_FIXTURE_FILE: fixture,
    },
  });
const login = (page) =>
  page.evaluate(() =>
    window.oarDesktop.request("/login", {
      method: "POST",
      body: JSON.stringify({
        callsign: "N7NATIVE",
        password: "Native-flow-fixture-123",
      }),
    }),
  );
const openRelay = async (page) => {
  await page.getByRole("button", { name: "Map settings", exact: true }).click();
  await page.getByRole("tab", { name: "Relay", exact: true }).click();
};
const confirm = (page) =>
  page
    .getByRole("dialog", { name: "Please confirm" })
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
try {
  app = await launch();
  let page = await app.firstWindow();
  const { realSecure, backend, mocked } = await app.evaluate(() => ({
    realSecure: globalThis.__relayFixture.realSecure,
    backend: globalThis.__relayFixture.backend,
    mocked: globalThis.__relayFixture.mocked,
  }));
  console.log(
    `VAULT MODE: ${mocked ? "explicit fixture; automation flags retained" : "OS defaults; password-store/basic and mock-keychain automation switches removed"}; backend=${backend}; realVaultEnabled=${realSecure}`,
  );
  if (!realSecure && !mocked)
    console.log(
      "SKIP REAL VAULT: unavailable; no enrollment or secret write attempted.",
    );
  else {
    const profile = await page.evaluate(() =>
      window.oarDesktop.request("/register", {
        method: "POST",
        body: JSON.stringify({
          callsign: "N7NATIVE",
          name: "Temporary fixture",
          email: "fixture@example.com",
          password: "Native-flow-fixture-123",
        }),
      }),
    );
    assert.ok(profile.id);
    await page.reload();
    await openRelay(page);
    await page
      .getByRole("button", { name: "Import / override settings.yaml" })
      .click();
    await expect(page.locator(".relay-panel")).toContainText(origin);
    let state = await page.evaluate(() => window.oarDesktop.relay("status"));
    assert.equal(state.enabled, false);
    assert.equal(state.identity, null);
    const enable = page.getByRole("button", {
      name: "Enable automatic registration and messaging",
    });
    await enable.click();
    await page
      .getByRole("dialog", { name: "Please confirm" })
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    assert.equal(
      (await page.evaluate(() => window.oarDesktop.relay("status"))).identity,
      null,
    );
    await enable.click();
    await confirm(page);
    await expect(
      page.getByRole("button", { name: "Synchronize now", exact: true }),
    ).toBeEnabled();
    state = await page.evaluate(() => window.oarDesktop.relay("status"));
    const nativeId = state.identity.deviceId;
    peer = new RelayClient({
      directory: path.join(root, "peer"),
      storage: testVault(),
      secure: () => true,
      allowLoopback: true,
    });
    peer.importSettings(settings);
    await peer.enable(1, true);
    await peer.sync(1);
    const peerId = peer.status(1).identity.deviceId;
    const untrusted = await page.evaluate(
      ({ origin, peerId }) =>
        window.oarDesktop
          .relay("send", { origin, deviceId: peerId, text: "Must not send" })
          .then(
            () => "",
            (e) => e.message,
          ),
      { origin, peerId },
    );
    assert.match(untrusted, /Verify/);
    await page.getByLabel("Peer device ID", { exact: true }).fill(peerId);
    await page.getByRole("button", { name: "Look up device keys" }).click();
    await page
      .getByRole("button", { name: "I verified this ID — pin keys" })
      .click();
    await confirm(page);
    await page
      .getByLabel("Message", { exact: true })
      .fill("Native UI confidential fixture");
    await page.getByRole("button", { name: "Queue encrypted message" }).click();
    await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
    await page
      .getByRole("button", { name: "Synchronize now", exact: true })
      .click();
    await expect(page.locator(".relay-history")).toContainText(
      "accepted by relay",
    );
    await peer.sync(1);
    assert.equal(peer.status(1).messages.length, 0);
    assert.equal(peer.status(1).issues.length, 1);
    const card = await peer.peer(1, nativeId);
    await peer.trust(1, nativeId, card.keySignature);
    await peer.sync(1);
    assert.equal(
      peer.status(1).messages[0].text,
      "Native UI confidential fixture",
    );
    await peer.send(1, nativeId, "Encrypted reply fixture");
    await peer.sync(1);
    await page
      .getByRole("button", { name: "Synchronize now", exact: true })
      .click();
    await expect(page.locator(".relay-history")).toContainText(
      "Encrypted reply fixture",
    );
    // Gate an actual accepted POST response, then use the real logout UI.
    await app.evaluate(() => {
      globalThis.__relayFixture.armed = true;
    });
    await page
      .getByLabel("Message", { exact: true })
      .fill("Accepted before logout fixture");
    await page.getByRole("button", { name: "Queue encrypted message" }).click();
    await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
    await page
      .getByRole("button", { name: "Synchronize now", exact: true })
      .click();
    await expect
      .poll(() => app.evaluate(() => globalThis.__relayFixture.pending), {
        timeout: 2500,
      })
      .toBe(true);
    await page.keyboard.press("Escape");
    await page.locator(".profile-button").click();
    await page.getByRole("menuitem", { name: "Logout", exact: true }).click();
    await expect
      .poll(() => app.evaluate(() => globalThis.__relayFixture.aborted), {
        timeout: 2500,
      })
      .toBe(true);
    await expect(
      page.getByText("Encrypted reply fixture", { exact: true }),
    ).toHaveCount(0);
    state = await page.evaluate(() => window.oarDesktop.relay("status"));
    assert.equal(state.identity, null);
    assert.deepEqual(state.messages, []);
    await peer.sync(1);
    assert.equal(
      peer
        .status(1)
        .messages.filter((m) => m.text === "Accepted before logout fixture")
        .length,
      1,
    );
    await login(page);
    state = await page.evaluate(() => window.oarDesktop.relay("status"));
    assert.equal(state.pending, 1);
    assert.equal(
      state.messages.find((m) => m.text === "Accepted before logout fixture")
        .status,
      "queued",
    );
    await page.evaluate(
      (origin) => window.oarDesktop.relay("sync", { origin }),
      origin,
    );
    await peer.sync(1);
    assert.equal(
      peer
        .status(1)
        .messages.filter((m) => m.text === "Accepted before logout fixture")
        .length,
      1,
    );
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await login(page);
    const restored = await page.evaluate(() =>
      window.oarDesktop.relay("status"),
    );
    assert.equal(restored.identity.deviceId, nativeId);
    assert.equal(restored.pending, 0);
    assert.ok(
      restored.messages.some((m) => m.text === "Encrypted reply fixture"),
    );
    console.log(
      `NATIVE ENROLLED FLOW PASSED (${mocked ? "EXPLICIT MOCK VAULT; automation backend: " + backend : "REAL OS VAULT " + backend}): UI import/cancel/accept consent, enrollment, reject unverified send, pin/send/receive, quarantine, logout DURING accepted transfer preserves queued UUID, retry after receiver ACK has no duplicate, restart restores identity/history. Native chooser stubbed, accepted response gated, test peer vault mocked; no production safeguards changed.`,
    );
  }
} finally {
  peer?.pause();
  await app?.close();
  rmSync(root, { recursive: true, force: true });
}
