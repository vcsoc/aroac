import { _electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeRepeaters } from "../server/repeaters.js";

const directory = mkdtempSync(path.join(tmpdir(), "aroac-radio-preview-"));
let app;
try {
  app = await _electron.launch({
    ...(process.env.OAR_TEST_EXECUTABLE ? { executablePath: process.env.OAR_TEST_EXECUTABLE } : {}),
    args: [...(process.env.OAR_TEST_EXECUTABLE ? [] : ["."]), "--user-data-dir=" + directory],
    env: { ...process.env, OAR_DEV_URL: "" },
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1360, height: 900 });
  await expect(
    page.getByRole("button", { name: "Radio programming", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.oarDesktop.setOffline(true));
  await page.evaluate(() =>
    window.oarDesktop.request("/register", {
      method: "POST",
      body: JSON.stringify({
        callsign: "N0RADIO",
        name: "Radio test",
        email: "radio@example.test",
        password: "temporary-test-passphrase-42",
      }),
    }),
  );
  const info = await page.evaluate(() => window.oarDesktop.connection());
  const db = new DatabaseSync(info.databasePath);
  const repeaters = normalizeRepeaters([
    {
      id: 77,
      callsign: "VE3RAD",
      city: "Toronto",
      latitude: 43.6,
      longitude: -79.3,
      frequency: 146940000,
      offset: -600000,
      mode: "FM",
      encode: "100.0",
      decode: "88.5",
      operational: 1,
    },
  ]);
  db.prepare("INSERT INTO repeater_cache VALUES(1,?,?)").run(
    JSON.stringify({
      repeaters,
      fetchedAt: new Date().toISOString(),
      omitted: 0,
    }),
    Date.now(),
  );
  db.close();
  const added = await page.evaluate(() =>
    window.oarDesktop.request("/radio-channels", {
      method: "POST",
      body: JSON.stringify({ repeaterId: "hearham-77" }),
    }),
  );
  assert.equal(added.snapshot.callsign, "VE3RAD");
  await page.reload();
  await page
    .getByRole("button", { name: "Radio programming", exact: true })
    .click();
  const drawer = page.getByRole("complementary", {
    name: "Radio programming",
    exact: true,
  });
  await expect(drawer).toContainText("VE3RAD");
  await expect(drawer).toContainText(
    "100.0 Hz CTCSS (directory report; verify)",
  );
  assert.ok(
    Array.isArray(await page.evaluate(() => window.oarDesktop.radioPorts())),
  ); // Cable is optional in CI.
  await drawer
    .getByRole("combobox", { name: "Transmit tone for VE3RAD" })
    .selectOption("tone:100.0");
  await drawer
    .getByRole("button", { name: "Verify radio channel VE3RAD" })
    .click();
  const confirm = page.getByRole("dialog", { name: "Please confirm" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Confirm" }).click();
  const exportButton = drawer.getByRole("button", {
    name: "Export 1 verified analog channels as CSV",
  });
  await expect(exportButton).toBeEnabled();
  const csvFile = path.join(directory, "verified-radio-test.csv");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, csvFile);
  await exportButton.click();
  await expect.poll(() => existsSync(csvFile)).toBe(true);
  assert.match(readFileSync(csvFile, "utf8"), /"Tone","100.0"/);
  if (process.env.OAR_TEST_READONLY_RADIO === "1") {
    await drawer.getByRole("button", { name: "Inspect empty memories and save full private backup" }).click();
    await expect(drawer.getByRole("combobox", { name: "Empty radio memory slot" })).toBeVisible({ timeout: 45000 });
    await drawer.getByRole("combobox", { name: "Empty radio memory slot" }).selectOption("127");
    await expect(drawer.getByRole("button", { name: "Program radio channel VE3RAD to memory 127" })).toBeEnabled();
    console.log("Physical UV-5R inspected read-only through AROAC UI; programming button present but NOT clicked.");
  }
  if (process.env.OAR_TEST_SIMULATED_PROGRAM === "1") {
    await app.evaluate(({ ipcMain }) => {
      let pending = null;
      ipcMain.removeHandler("oar:radio-ports");
      ipcMain.handle("oar:radio-ports", () => [{ path: "/dev/ttyUSB0", name: "Simulated cable; no hardware writes", accessible: true }]);
      ipcMain.removeHandler("oar:radio-backup");
      ipcMain.handle("oar:radio-backup", () => ({ version: "HN5RV011", filename: "simulated-private.img", sha256: "a".repeat(64), emptySlots: [126, 127] }));
      ipcMain.removeHandler("oar:radio-pending");
      ipcMain.handle("oar:radio-pending", () => pending);
      ipcMain.removeHandler("oar:radio-program");
      ipcMain.handle("oar:radio-program", (_event, device, id, slot, sha, row, confirmation) => {
        if (device !== "/dev/ttyUSB0" || typeof id !== "number" || slot !== 127 || sha !== "a".repeat(64) ||
            JSON.parse(row).txTone !== "100.0" || confirmation !== "PROGRAM RADIO SLOT 127") throw Error("Bad simulated program payload");
        pending = { slot, callsign: "VE3RAD", stage: "awaiting-power-cycle", backupFile: "simulated-private.img", device };
        return pending;
      });
      ipcMain.removeHandler("oar:radio-verify");
      ipcMain.handle("oar:radio-verify", () => { pending = null; return { state: "programmed", slot: 127, backupFile: "simulated-verified.img" }; });
    });
    await page.reload();
    await page.getByRole("button", { name: "Radio programming", exact: true }).click();
    await drawer.getByRole("button", { name: "Inspect empty memories and save full private backup" }).click();
    await expect(drawer.getByRole("combobox", { name: "Empty radio memory slot" })).toBeVisible();
    await drawer.getByRole("button", { name: "Program radio channel VE3RAD to memory 127" }).click();
    const permission = page.getByRole("dialog", { name: "Please confirm" });
    await expect(permission).toContainText("146.34000 MHz");
    await permission.getByRole("button", { name: "Cancel" }).click();
    await expect(drawer).not.toContainText("Radio write not yet fully verified");
    await drawer.getByRole("button", { name: "Program radio channel VE3RAD to memory 127" }).click();
    await permission.getByRole("button", { name: "Confirm" }).click();
    await expect(drawer).toContainText("Radio write not yet fully verified: slot 127");
    await page.reload();
    await page.getByRole("button", { name: "Radio programming", exact: true }).click();
    await expect(drawer).toContainText("Radio write not yet fully verified: slot 127");
    await drawer.getByRole("button", { name: "Verify full radio image (read-only)" }).click();
    await expect(drawer).toContainText("SUCCESS: memory 127 and the entire radio image match");
    console.log("Simulated packaged USB UI passed: exact settings confirmation, cancel, persistent pending, explicit read-only verification. No radio writes sent.");
  }
  await drawer
    .getByRole("button", { name: "Remove radio channel VE3RAD" })
    .click();
  await expect(drawer).toContainText("No radio channels saved yet");
  console.log(
    "Radio list smoke passed: offline cached repeater, private channel, reported tone, explicit verification, CSV availability, removal.",
  );
} finally {
  await app?.close();
  rmSync(directory, { recursive: true, force: true });
}
