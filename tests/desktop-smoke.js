import { _electron, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const userData = mkdtempSync(path.join(tmpdir(), "oar-standalone-test-"));
let electron;
const errors = [];
async function launch() {
  electron = await _electron.launch({
    ...(process.env.OAR_DESKTOP_EXECUTABLE
      ? { executablePath: process.env.OAR_DESKTOP_EXECUTABLE }
      : {}),
    args: [
      ...(process.env.OAR_DESKTOP_EXECUTABLE ? [] : ["."]),
      "--user-data-dir=" + userData,
    ],
    env: { ...process.env, OAR_SERVER_URL: "", OAR_DEV_URL: "" },
  });
  const page = await electron.firstWindow();
  page.on("pageerror", (e) => { errors.push(e.message); console.error('Desktop renderer:',e.stack); });
  await page
    .getByRole("heading", { name: "Good to have you on air." })
    .waitFor();
  return page;
}
const account = {
  callsign: "N1DESK",
  name: "Local operator",
  email: "local@example.com",
  password: "standalone-test-password",
};
try {
  let page = await launch();
  assert.equal(new URL(page.url()).protocol, "oar:");
  const info = await page.evaluate(() => window.oarDesktop.connection());
  assert.equal(info.mode, "local");
  assert.ok(existsSync(info.databasePath));
  assert.equal(info.server, undefined);
  assert.equal(
    await page.getByText("Server address", { exact: true }).count(),
    0,
  );
  await page.evaluate(() => window.oarDesktop.setOffline(true));
  const registered = await page.evaluate(
    (data) =>
      window.oarDesktop.request("/register", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    account,
  );
  assert.equal(registered.callsign, account.callsign);
  assert.equal(registered.token, undefined);
  assert.equal(registered.grid, "");
  await page.evaluate(() =>
    window.oarDesktop.request("/logbook", {
      method: "POST",
      body: JSON.stringify({
        callsign: "W1XYZ",
        frequency: 14.074,
        mode: "FT8",
        notes: "Local persistence test",
        created: "2026-09-17T12:00:00Z",
      }),
    }),
  );
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  assert.equal(
    await page.evaluate(async () => {
      try {
        await window.oarDesktop.request("/../other");
        return false;
      } catch {
        return true;
      }
    }),
    true,
  );
  await electron.close();
  electron = null;
  // A fresh application process, same local database, no external service.
  page = await launch();
  await page.evaluate(
    (data) =>
      window.oarDesktop.request("/login", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    account,
  );
  assert.equal(
    (await page.evaluate(() => window.oarDesktop.connection())).offline,
    true,
  );
  const rows = await page.evaluate(() => window.oarDesktop.request("/logbook"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].notes, "Local persistence test");
  await page.reload();
  await page
    .getByRole("button", { name: new RegExp(account.callsign) })
    .waitFor();
  await page.getByRole("button", { name: "World atlas" }).click();
  await page.locator(".maplibregl-canvas").waitFor();
  assert.ok((await page.locator(".world-map").boundingBox()).height > 280);
  const map = page.locator(".world-map");
  await expect(map).toHaveAttribute("data-night-ready", "true");
  await expect(map).toHaveAttribute("data-projection", "mercator");
  await page
    .getByRole("switch", { name: "Map projection", exact: true })
    .click();
  await expect(map).toHaveAttribute("data-projection", "globe");
  await page.getByRole("button", { name: "Quick Switch", exact: true }).click();
  await page.getByRole("switch", { name: "Grey line", exact: true }).click();
  await expect(map).toHaveAttribute("data-night-features", "0");
  await page.getByRole("switch", { name: "Grey line", exact: true }).click();
  await expect(map).not.toHaveAttribute("data-night-features", "0");
  await page.getByRole("switch", { name: "Show time zones" }).click();
  await expect(map).toHaveAttribute("data-timezones", "true");
  assert.equal(await page.locator(".timezone-map-label").count(), 24);
  await page.getByRole("switch", { name: "Show time zones" }).click();
  await expect(page.locator(".timezone-map-label")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Close Quick Switch", exact: true })
    .click();
  const database = new DatabaseSync(info.databasePath);
  database.prepare("INSERT INTO geocode_cache VALUES(?,?,?)").run(
    "10 downing street, london",
    JSON.stringify([
      {
        id: "test-address",
        title: "10 Downing Street",
        subtitle: "London, United Kingdom",
        lat: 51.5034,
        lng: -0.1276,
        zoom: 17,
      },
    ]),
    Date.now(),
  );
  database.close();
  await page
    .getByRole("combobox", { name: "Search addresses and places" })
    .fill("10 Downing Street, London");
  await page
    .getByRole("button", { name: "Search location", exact: true })
    .click();
  await page.getByRole("option", { name: /10 Downing Street/ }).click();
  await expect(map).toHaveAttribute(
    "data-selected-location",
    "51.5034,-0.1276",
  );
  await expect(
    page.locator(".location-pane").getByText("Europe/London", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use approximate location for my station" })
    .click();
  const updated = await page.evaluate(() => window.oarDesktop.request("/me"));
  assert.match(updated.grid, /^[A-R]{2}\d{2}[A-X]{2}$/);
  await page
    .getByRole("combobox", { name: "Search addresses and places" })
    .fill("-33.9249, 18.4241");
  await page
    .getByRole("button", { name: "Search location", exact: true })
    .click();
  await expect(map).toHaveAttribute(
    "data-selected-location",
    "-33.9249,18.4241",
  );
  await page
    .getByRole("switch", { name: "Map projection", exact: true })
    .click();
  await expect(map).toHaveAttribute("data-projection", "mercator");
  await page.getByRole("button", { name: "Map settings", exact: true }).click();
  await page.getByRole("tab", { name: "Data", exact: true }).click();
  await page
    .getByText("Your station lives on this device.", { exact: true })
    .waitFor();
  const backupFile = path.join(userData, "test-backup.sqlite");
  await electron.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, backupFile);
  const backup = await page.evaluate(() => window.oarDesktop.backup());
  assert.equal(backup.path, backupFile);
  assert.ok(existsSync(backupFile));
  await page.screenshot({ path: "/tmp/oar-standalone-desktop.png" });
  await page.evaluate(() =>
    window.oarDesktop.request("/logout", { method: "POST", body: "{}" }),
  );
  assert.equal(
    await page.evaluate(() => window.oarDesktop.request("/me")),
    null,
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Sign in", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "New here? Create your station" })
    .click();
  const auth = page.getByRole("dialog");
  await auth.getByLabel("Callsign", { exact: true }).fill("not-a-call");
  await auth.getByLabel("Name", { exact: true }).fill(account.name);
  await auth.getByLabel("Email", { exact: true }).fill(account.email);
  await auth.getByLabel("Password", { exact: true }).fill("short");
  await auth.getByRole("checkbox").check();
  await auth
    .getByRole("button", { name: "Create station", exact: true })
    .click();
  await expect(auth.getByLabel("Callsign", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(auth.getByLabel("Password", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await auth.getByLabel("Callsign", { exact: true }).fill(account.callsign);
  await auth.getByLabel("Password", { exact: true }).fill(account.password);
  await auth
    .getByRole("button", { name: "Create station", exact: true })
    .click();
  await expect(
    auth.getByText(
      "This callsign is already registered on this installation.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(auth).not.toContainText("Error invoking remote method");
  await auth
    .getByRole("button", { name: "Already registered? Sign in" })
    .click();
  await auth.getByLabel("Password", { exact: true }).fill("incorrect password");
  await auth.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(auth.getByRole("alert")).toHaveText(
    "Incorrect callsign or password",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Standalone desktop passed: no external service/setup, offline registration and login, persisted SQLite logbook across restart, database backup, isolated renderer, map shell, settings and logout.",
  );
} catch (error) {
  if (electron) {
    const window = await electron.firstWindow();
    console.error(
      "Desktop UI on failure:",
      await window.locator(".address-dropdown, .auth-dialog").allTextContents(),
    );
    await window.screenshot({ path: "/tmp/oar-desktop-failure.png" });
  }
  throw error;
} finally {
  await electron?.close();
  rmSync(userData, { recursive: true, force: true });
}
