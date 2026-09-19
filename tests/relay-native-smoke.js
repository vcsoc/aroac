import { _electron, expect } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const directory = mkdtempSync(path.join(os.tmpdir(), "oar-relay-native-"));
let app;
try {
  app = await _electron.launch({
    args: [".", "--user-data-dir=" + directory],
    env: { ...process.env, OAR_DEV_URL: "", OAR_SERVER_URL: "" },
  });
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
  assert.deepEqual(errors, []);
  console.log(
    "NATIVE RELAY SMOKE PASSED: bundled sodium transport loads, Settings Relay renders, guest status exposes no identity, guest enrollment denied, newest concurrent login wins. No real enrollment or OS key storage exercised.",
  );
} finally {
  await app?.close();
  rmSync(directory, { recursive: true, force: true });
}
