import { _electron, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const userData = mkdtempSync(path.join(os.tmpdir(), "oar-release-ten-"));
let app;
try {
  app = await _electron.launch({
    ...(process.env.OAR_DESKTOP_EXECUTABLE
      ? { executablePath: process.env.OAR_DESKTOP_EXECUTABLE }
      : {}),
    args: [
      ...(process.env.OAR_DESKTOP_EXECUTABLE ? [] : ["."]),
      "--user-data-dir=" + userData,
    ],
    env: { ...process.env, OAR_DEV_URL: "", OAR_SERVER_URL: "" },
  });
  const page = await app.firstWindow(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator(".app-statusbar")).toContainText(version);
  await page.evaluate(() => window.oarDesktop.setOffline(true));
  await page.evaluate(() =>
    window.oarDesktop.request("/register", {
      method: "POST",
      body: JSON.stringify({
        callsign: "N1UPDATE",
        name: "Update Tester",
        email: "update@example.com",
        password: "update-tests-password-123",
      }),
    }),
  );
  await page.reload();
  await page.locator(".profile-button").click();
  await page.getByRole("menuitem", { name: "Check for updates" }).click();
  const notice = page.getByRole("region", { name: "OAR update" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(
    process.env.OAR_DESKTOP_EXECUTABLE ? "offline" : "AppImage",
  );
  await notice.getByRole("button", { name: "Dismiss" }).click();
  const source = await page.evaluate(() =>
    window.oarDesktop.request("/sources"),
  );
  assert.equal(source.path, path.join(userData, "sources.yaml"));
  assert.equal(
    (
      await page.evaluate(() =>
        window.oarDesktop.request("/country?lat=43.65&lng=-79.38"),
      )
    ).countryCode,
    "CA",
  );
  assert.ok(existsSync(source.path));
  writeFileSync(source.path, "version: [");
  await page.getByRole("button", { name: "Map settings", exact: true }).click();
  const config = page.getByRole("region", {
    name: "Source configuration error",
  });
  await expect(config).toBeVisible({ timeout: 20000 });
  await config
    .getByRole("button", { name: "Reset config", exact: true })
    .click();
  await expect(page.locator(".oar-toast")).toContainText("bundled defaults");
  await expect(page.getByLabel("Sources YAML")).toHaveValue(/version: 1/);
  const restored = await page.evaluate(() =>
    window.oarDesktop.request("/sources"),
  );
  assert.equal(restored.error, "");
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page.getByRole("button", { name: "About OAR", exact: true }).click();
  await page.getByRole("tab", { name: "License", exact: true }).click();
  await expect(page.locator(".license-content")).toContainText(
    "electron-updater@",
  );
  await app.evaluate(({ shell }) => {
    shell.openPath = async (filename) => {
      globalThis.testLicensePath = filename;
      return "";
    };
  });
  await page
    .getByRole("button", { name: "Open bundled Chromium license notices" })
    .click();
  await expect
    .poll(() => app.evaluate(() => globalThis.testLicensePath))
    .toMatch(/LICENSES\.chromium\.html$/);
  assert.ok(existsSync(await app.evaluate(() => globalThis.testLicensePath)));
  await page.keyboard.press("Escape");
  if (process.env.OAR_VERIFY_LIVE_UPDATE_METADATA) {
    await page.evaluate(() => window.oarDesktop.setOffline(false));
    const result = await page.evaluate(() => window.oarDesktop.update("check"));
    assert.equal(result.phase, "current", JSON.stringify(result));
  }
  // Exercise the native notification/IPC UI with simulated updater events;
  // never replace the running test executable or install an unpublished build.
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    globalThis.testUpdateActions = [];
    globalThis.testUpdateState = {
      phase: "available",
      version: "0.3.11",
      message: "Test update offer",
    };
    globalThis.sendTestUpdate = (state) => {
      globalThis.testUpdateState = state;
      BrowserWindow.getAllWindows()[0].webContents.send(
        "oar:update-state",
        state,
      );
    };
    ipcMain.removeHandler("oar:update");
    ipcMain.handle("oar:update", (_event, action) => {
      globalThis.testUpdateActions.push(action);
      if (action === "install")
        globalThis.sendTestUpdate({
          phase: "downloading",
          version: "0.3.11",
          percent: 37,
          message: "Downloading test package",
        });
      else if (["later", "skip"].includes(action))
        globalThis.sendTestUpdate({ phase: "idle" });
      return globalThis.testUpdateState;
    });
    globalThis.sendTestUpdate(globalThis.testUpdateState);
  });
  await notice.getByRole("button", { name: "Skip this version" }).click();
  await expect(notice).toHaveCount(0);
  await app.evaluate(() =>
    globalThis.sendTestUpdate({
      phase: "available",
      version: "0.3.11",
      message: "Test offer",
    }),
  );
  await notice.getByRole("button", { name: "Later", exact: true }).click();
  await expect(notice).toHaveCount(0);
  await app.evaluate(() =>
    globalThis.sendTestUpdate({
      phase: "available",
      version: "0.3.11",
      message: "Test offer",
    }),
  );
  await notice.getByRole("button", { name: "Update and restart" }).click();
  await expect(notice.getByRole("progressbar")).toHaveAttribute("value", "37");
  await app.evaluate(() =>
    globalThis.sendTestUpdate({
      phase: "backing-up",
      message: "Creating a backup",
    }),
  );
  await expect(notice).toContainText("Creating a backup");
  await app.evaluate(() =>
    globalThis.sendTestUpdate({
      phase: "installing",
      message: "Installing and restarting",
    }),
  );
  await expect(notice).toContainText("Installing and restarting");
  assert.deepEqual(await app.evaluate(() => globalThis.testUpdateActions), [
    "skip",
    "later",
    "install",
  ]);
  assert.deepEqual(errors, []);
  console.log(
    `Release ${version} native smoke passed: update control/offline handling, owned source YAML recovery, bundled dependency and Chromium licenses.`,
  );
} finally {
  await app?.close();
  rmSync(userData, { recursive: true, force: true });
}
