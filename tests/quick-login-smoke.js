import { _electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
const dir = mkdtempSync(path.join(tmpdir(), "oar-quick-login-"));
let app, page;
const account = {
  callsign: "N0QUICK",
  name: "Quick test",
  email: "quick@example.test",
  password: "temporary-test-passphrase-42",
};
async function launch() {
  app = await _electron.launch({
    ...(process.env.OAR_DESKTOP_EXECUTABLE
      ? { executablePath: process.env.OAR_DESKTOP_EXECUTABLE }
      : {}),
    args: [
      ...(process.env.OAR_DESKTOP_EXECUTABLE ? [] : ["."]),
      "--user-data-dir=" + dir,
    ],
    env: { ...process.env, OAR_DEV_URL: "" },
  });
  page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    page.getByRole("button", { name: "Add clock", exact: true }),
  ).toBeEnabled();
}
const request = (route, body) =>
  page.evaluate(
    ([route, body]) =>
      window.oarDesktop.request(
        route,
        body ? { method: "POST", body: JSON.stringify(body) } : {},
      ),
    [route, body],
  );
async function restart() {
  await app.close();
  app = null;
  await launch();
}
async function login(remember, keepSigned, expectRememberDefault = false) {
  await page.getByRole("button", { name: "Sign in", exact: false }).click();
  await page.getByRole("menuitem", { name: "Sign in" }).click();
  const auth = page.locator(".auth-dialog");
  await auth.getByLabel("Callsign", { exact: true }).fill(account.callsign);
  const password = auth.getByLabel("Password", { exact: true });
  await password.fill(account.password);
  await expect(password).toHaveAttribute("type", "password");
  await auth.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue(account.password);
  await auth.getByRole("button", { name: "Hide password" }).click();
  await expect(password).toHaveAttribute("type", "password");
  const rememberSwitch = auth.getByRole("switch", {
    name: "Remember my callsign",
    exact: true,
  });
  if (expectRememberDefault)
    await expect(rememberSwitch).toHaveAttribute("aria-checked", "true");
  if ((await rememberSwitch.getAttribute("aria-checked")) !== String(remember))
    await rememberSwitch.click();
  const keepSwitch = auth.getByRole("switch", { name: "Keep me signed in" });
  await expect(keepSwitch).toBeEnabled();
  if (
    keepSigned !== undefined &&
    (await keepSwitch.getAttribute("aria-checked")) !== String(keepSigned)
  )
    await keepSwitch.click();
  await auth.getByRole("button", { name: "Sign in", exact: true }).click();
  if (
    keepSigned &&
    !(await page.evaluate(() => window.oarDesktop.loginSettings()))
      .secureStorage
  ) {
    const confirm = page.getByRole("dialog", { name: "Please confirm" });
    await expect(confirm).toContainText("UNENCRYPTED");
    await confirm.getByRole("button", { name: "Confirm" }).click();
  }
  await expect(auth).toHaveCount(0);
}
try {
  await launch();
  await page.evaluate(() => window.oarDesktop.setOffline(true));
  await request("/pins", { label: "No drawer jump", lat: 10, lng: 0 });
  await page.reload();
  await page
    .getByRole("button", { name: "Saved pin No drawer jump", exact: true })
    .click();
  await expect(page.locator(".location-pane")).toHaveAttribute(
    "aria-hidden",
    "false",
  );
  await expect(page.locator("#map-drawer")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await page
    .getByRole("button", { name: "Saved locations", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Saved pin No drawer jump", exact: true })
    .click();
  await expect(page.locator("[data-pin-id].selected")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Close side panel", exact: true })
    .click();
  await page.getByRole("button", { name: "Quick Switch", exact: true }).click();
  const quick = page.locator("#quick-switch-panel");
  await expect(quick).toBeVisible();
  await expect(quick.getByRole("switch")).toHaveCount(9);
  await page.screenshot({ path: "/tmp/oar-quick-switch.png" });
  await page.keyboard.press("Escape");
  await expect(quick).toHaveCount(0);
  await page.getByRole("button", { name: "Map settings", exact: true }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Sources" }),
  ).not.toContainText("Show street names");
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await request("/register", account);
  await request("/logout", {});
  await page.reload();
  await login(true, undefined, true);
  assert.equal((await request("/me")).callsign, account.callsign);
  await page.reload();
  assert.equal((await request("/me")).callsign, account.callsign);
  await restart();
  assert.equal(await request("/me"), null);
  await page.getByRole("button", { name: "Sign in", exact: false }).click();
  await page.getByRole("menuitem", { name: "Sign in" }).click();
  await expect(page.getByLabel("Callsign", { exact: true })).toHaveValue(
    account.callsign,
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await login(true);
  const prefs = await page.evaluate(() => window.oarDesktop.loginSettings());
  if (!prefs.secureStorage) {
    await assert.rejects(
      () => page.evaluate(() => window.oarDesktop.loginSettings(true)),
      /Confirm unencrypted/,
    );
  }
  await page.getByRole("button", { name: "Map settings", exact: true }).click();
  await page.getByRole("tab", { name: "Login", exact: true }).click();
  await page
    .getByRole("switch", {
      name: "Keep me signed in across restarts",
      exact: true,
    })
    .click();
  if (!prefs.secureStorage) {
    const confirm = page.getByRole("dialog", { name: "Please confirm" });
    await expect(confirm).toContainText("UNENCRYPTED");
    await confirm.getByRole("button", { name: "Confirm" }).click();
  }
  await expect(
    page.getByRole("switch", {
      name: "Keep me signed in across restarts",
      exact: true,
    }),
  ).toHaveAttribute("aria-checked", "true");
  const file = path.join(dir, "local-session.json");
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.ok(!readFileSync(file, "utf8").includes(account.password));
  const config = JSON.parse(readFileSync(file, "utf8"));
  assert.ok(prefs.secureStorage ? config.session : config.sessionPlain);
  const info = await page.evaluate(() => window.oarDesktop.connection());
  const db = new DatabaseSync(info.databasePath);
  assert.equal(
    db.prepare("SELECT expires FROM sessions").get().expires,
    Number.MAX_SAFE_INTEGER,
  );
  db.close();
  await restart();
  assert.equal((await request("/me")).callsign, account.callsign);
  await page.evaluate(() => window.oarDesktop.loginSettings(false));
  assert.equal((await request("/me")).callsign, account.callsign);
  assert.ok(!JSON.parse(readFileSync(file, "utf8")).sessionPlain);
  await restart();
  assert.equal(await request("/me"), null);
  await login(false);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("oar-saved-callsign")),
    null,
  );
  await request("/logout", {});
  await page.reload();
  await login(false, true);
  const persisted = JSON.parse(readFileSync(file, "utf8"));
  assert.ok(prefs.secureStorage ? persisted.session : persisted.sessionPlain);
  await restart();
  assert.equal((await request("/me")).callsign, account.callsign);
  await request("/logout", {});
  await restart();
  assert.equal(await request("/me"), null);
  console.log(
    "Quick/login passed: 9 quick switches, password visibility, callsign memory, sign-in persistence consent and restart, settings revocation and manual sign-out revocation.",
  );
} catch (e) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: "/tmp/oar-quick-login-failure.png" });
    console.error((await page.locator("body").innerText()).slice(-2500));
  }
  throw e;
} finally {
  await app?.close();
  rmSync(dir, { recursive: true, force: true });
}
