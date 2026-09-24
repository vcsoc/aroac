import { _electron, expect } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const directory = mkdtempSync(path.join(os.tmpdir(), "oar-relay-native-"));
let app;
try {
  app = await _electron.launch({
    ...(process.env.OAR_DESKTOP_EXECUTABLE
      ? { executablePath: process.env.OAR_DESKTOP_EXECUTABLE }
      : {}),
    args: [
      ...(process.env.OAR_DESKTOP_EXECUTABLE ? [] : ["."]),
      "--user-data-dir=" + directory,
    ],
    env: { ...process.env, OAR_DEV_URL: "", OAR_SERVER_URL: "" },
  });
  if (process.env.OAR_EXPECTED_VERSION)
    assert.equal(
      await app.evaluate(({ app }) => app.getVersion()),
      process.env.OAR_EXPECTED_VERSION,
    );
  const page = await app.firstWindow(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "Map settings", exact: true }).click();
  await page.getByRole("tab", { name: "Relay", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Device messaging · preview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import / override settings.yaml" }),
  ).toBeVisible();
  const state = await page.evaluate(() => window.oarDesktop.relay("status"));
  assert.equal(
    state.loopbackTesting,
    process.env.OAR_RELAY_ALLOW_LOOPBACK === "1",
  );
  if (state.loopbackTesting)
    await expect(
      page.getByText(
        "Local HTTP testing is enabled for loopback addresses only.",
        { exact: false },
      ),
    ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry credential storage", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Restart AROAC", exact: true }),
  ).toBeVisible();
  assert.equal(typeof state.storage.backend, "string");
  assert.equal(typeof state.storage.message, "string");
  await page
    .getByRole("button", { name: "Retry credential storage", exact: true })
    .click();
  const retried = await page.evaluate(() => window.oarDesktop.relay("status"));
  assert.equal(retried.enabled, false);
  assert.equal(retried.identity, null);
  assert.equal(state.url, null);
  assert.equal(state.enabled, false);
  assert.equal(state.identity, null);
  const denied = await page.evaluate(() =>
    window.oarDesktop.relay("enable", { enabled: true, origin: null }).then(
      () => "",
      (e) => e.message,
    ),
  );
  assert.match(denied, /Sign in/);
  const race = await page.evaluate(async () => {
    const request = window.oarDesktop.request,
      password = "Native-relay-fixture-123";
    for (const callsign of ["N1RELAYA", "N2RELAYB"])
      await request("/register", {
        method: "POST",
        body: JSON.stringify({
          callsign,
          name: "Temporary test",
          email: "relay@example.com",
          password,
        }),
      });
    await request("/logout", { method: "POST", body: "{}" });
    const results = await Promise.all(
      ["N1RELAYA", "N2RELAYB"].map((callsign) =>
        request("/login", {
          method: "POST",
          body: JSON.stringify({ callsign, password }),
        }),
      ),
    );
    return { results, current: await request("/me") };
  });
  assert.match(race.results[0].$oarError?.message || "", /Session changed/);
  assert.equal(race.results[1].callsign, "N2RELAYB");
  assert.equal(race.current.callsign, "N2RELAYB");
  // Exercise restart IPC without closing the test application or user sessions.
  await app.evaluate(({ app, dialog }) => {
    globalThis.restartFixture = {
      quit: app.quit,
      relaunch: app.relaunch,
      showMessageBox: dialog.showMessageBox,
      image: process.env.APPIMAGE,
      calls: [],
    };
    app.relaunch = (options) => globalThis.restartFixture.calls.push(options);
    app.quit = () => globalThis.restartFixture.calls.push("quit");
    dialog.showMessageBox = async () => ({ response: 0 });
  });
  await page.evaluate(() => window.oarDesktop.relay("restart-storage"));
  assert.deepEqual(
    await app.evaluate(() => globalThis.restartFixture.calls),
    [],
  );
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1 });
    if (process.platform === "linux")
      process.env.APPIMAGE = "/tmp/OAR-restart-fixture.AppImage";
  });
  await page.evaluate(() => window.oarDesktop.relay("restart-storage"));
  const restart = await app.evaluate(({ app, dialog }) => {
    const fixture = globalThis.restartFixture;
    app.quit = fixture.quit;
    app.relaunch = fixture.relaunch;
    dialog.showMessageBox = fixture.showMessageBox;
    if (fixture.image === undefined) delete process.env.APPIMAGE;
    else process.env.APPIMAGE = fixture.image;
    return { calls: fixture.calls, platform: process.platform };
  });
  assert.deepEqual(restart.calls, [
    restart.platform === "linux"
      ? { execPath: "/tmp/OAR-restart-fixture.AppImage" }
      : {},
    "quit",
  ]);
  assert.deepEqual(errors, []);
  console.log(
    "NATIVE RELAY SMOKE PASSED: bundled sodium transport loads, Settings Relay renders, guest status exposes no identity, guest enrollment denied, newest concurrent login wins. No real enrollment or OS key storage exercised.",
  );
} finally {
  await app?.close();
  rmSync(directory, { recursive: true, force: true });
}
