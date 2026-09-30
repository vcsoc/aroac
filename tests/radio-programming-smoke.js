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
    ...(process.env.OAR_TEST_EXECUTABLE
      ? { executablePath: process.env.OAR_TEST_EXECUTABLE }
      : {}),
    args: [
      ...(process.env.OAR_TEST_EXECUTABLE ? [] : ["."]),
      "--user-data-dir=" + directory,
    ],
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
  const drawer = page.locator("#radio-workspace");
  await drawer
    .getByText("Detailed channel cards and directory reports", { exact: true })
    .click();
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
    await drawer
      .getByText("Register the connected radio and capture its fingerprint", {
        exact: true,
      })
      .click();
    const registration = drawer.getByRole("form", {
      name: "Register physical radio",
    });
    await registration
      .getByLabel("Radio profile name")
      .fill("Read-only test radio");
    await registration
      .getByLabel("Physical serial or unique label")
      .fill("Temporary test workspace / user-confirmed connected UV-5R");
    await registration.getByRole("checkbox").check();
    await registration
      .getByRole("button", {
        name: "Register radio, fingerprint and private backup (read-only)",
      })
      .click();
    await expect(
      drawer.getByRole("combobox", { name: "Empty radio memory slot" }),
    ).toBeVisible({ timeout: 45000 });
    await expect(drawer).toContainText("Fingerprint v1:");
    await expect(
      drawer.getByRole("button", {
        name: "Refresh this radio’s backup history",
      }),
    ).toBeVisible();
    await drawer
      .getByRole("button", {
        name: "Inspect empty memories and save full private backup",
      })
      .click();
    await expect(
      drawer.getByRole("combobox", { name: "Empty radio memory slot" }),
    ).toBeVisible({ timeout: 45000 });
    await drawer
      .getByRole("combobox", { name: "Empty radio memory slot" })
      .selectOption("127");
    await expect(
      drawer.getByRole("button", {
        name: "Program radio channel VE3RAD to memory 127",
      }),
    ).toBeEnabled();
    console.log(
      "Physical UV-5R inspected read-only through AROAC UI; programming button present but NOT clicked.",
    );
  }
  if (process.env.OAR_TEST_SIMULATED_PROGRAM === "1") {
    await app.evaluate(({ ipcMain }) => {
      let pending = null;
      ipcMain.removeHandler("oar:radio-ports");
      ipcMain.handle("oar:radio-ports", () => [
        {
          path: "/dev/ttyUSB0",
          name: "Simulated cable; no hardware writes",
          accessible: true,
        },
      ]);
      ipcMain.removeHandler("oar:radio-profiles");
      ipcMain.handle("oar:radio-profiles", () => [
        {
          id: "11111111-1111-1111-1111-111111111111",
          label: "Simulated radio",
          serial: "SIM-ONLY",
          fingerprintVersion: 1,
          fingerprint: "b".repeat(64),
        },
      ]);
      ipcMain.removeHandler("oar:radio-history");
      ipcMain.handle("oar:radio-history", () => []);
      ipcMain.removeHandler("oar:radio-backup");
      ipcMain.handle("oar:radio-backup", () => ({
        version: "HN5RV011",
        filename: "simulated-private.img",
        sha256: "a".repeat(64),
        emptySlots: [126, 127],
        memories: [
          {
            slot: 0,
            name: "SIMRX",
            rxMHz: 146.52,
            txMHz: null,
            receiveOnly: true,
            tone: "none",
            mode: "NFM",
            supportedForCapture: true,
            warning: "Simulated extracted memory",
          },
        ],
      }));
      ipcMain.removeHandler("oar:radio-pending");
      ipcMain.handle("oar:radio-pending", () => pending);
      ipcMain.removeHandler("oar:radio-program");
      ipcMain.handle(
        "oar:radio-program",
        (_event, device, id, slot, sha, row, confirmation) => {
          if (
            device !== "/dev/ttyUSB0" ||
            typeof id !== "number" ||
            slot !== 127 ||
            sha !== "a".repeat(64) ||
            JSON.parse(row).txTone !== "100.0" ||
            confirmation !== "PROGRAM RADIO SLOT 127"
          )
            throw Error("Bad simulated program payload");
          pending = {
            slot,
            callsign: "VE3RAD",
            stage: "awaiting-power-cycle",
            backupFile: "simulated-private.img",
            device,
          };
          return pending;
        },
      );
      ipcMain.removeHandler("oar:radio-verify");
      ipcMain.handle("oar:radio-verify", () => {
        pending = null;
        return {
          state: "programmed",
          slot: 127,
          backupFile: "simulated-verified.img",
        };
      });
    });
    await page.reload();
    await page
      .getByRole("button", { name: "Radio programming", exact: true })
      .click();
    await drawer
      .getByText("Detailed channel cards and directory reports", {
        exact: true,
      })
      .click();
    await drawer
      .getByRole("combobox", { name: "Registered physical radio" })
      .selectOption("11111111-1111-1111-1111-111111111111");
    await drawer
      .getByLabel(
        "I checked the connected radio’s physical serial/label matches this profile",
      )
      .check();
    await drawer
      .getByRole("button", { name: "Use this radio profile" })
      .click();
    await drawer
      .getByRole("button", {
        name: "Inspect empty memories and save full private backup",
      })
      .click();
    await expect(
      drawer.getByRole("combobox", { name: "Empty radio memory slot" }),
    ).toBeVisible();
    await drawer
      .getByRole("button", { name: "Radio memories (128 slots)", exact: true })
      .click();
    const memoryTable = drawer.getByRole("table", {
      name: "Extracted radio memories",
    });
    await expect(memoryTable.getByRole("row")).toHaveCount(129);
    await expect(
      memoryTable.getByRole("row", { name: "Channel row SIMRX", exact: true }),
    ).toContainText("Disabled");
    const emptyMemory = memoryTable.getByRole("row", {
      name: "Channel row empty memory 127",
      exact: true,
    });
    await emptyMemory.getByRole("button", { name: "Enter channel" }).click();
    await emptyMemory
      .getByRole("textbox", { name: "Name for empty memory 127" })
      .fill("DRAFT");
    await emptyMemory
      .getByRole("spinbutton", { name: "RX MHz for empty memory 127" })
      .fill("146.52");
    await emptyMemory.getByRole("checkbox").check();
    await emptyMemory.getByRole("button", { name: "Save draft" }).click();
    await expect(emptyMemory).toContainText("radio unchanged");
    await drawer
      .getByRole("button", { name: /Saved programming list/ })
      .click();
    await drawer
      .getByRole("table", { name: "Saved channel programming list" })
      .getByRole("row", { name: "Channel row DRAFT", exact: true })
      .getByRole("button", { name: "Remove draft" })
      .click();
    console.log(
      "128-slot extraction table and inline empty-memory draft capture passed; no radio write.",
    );
    await drawer
      .getByRole("button", {
        name: "Program radio channel VE3RAD to memory 127",
      })
      .click();
    const permission = page.getByRole("dialog", { name: "Please confirm" });
    await expect(permission).toContainText("146.34000 MHz");
    await permission.getByRole("button", { name: "Cancel" }).click();
    await expect(drawer).not.toContainText(
      "Radio write not yet fully verified",
    );
    await drawer
      .getByRole("button", {
        name: "Program radio channel VE3RAD to memory 127",
      })
      .click();
    await permission.getByRole("button", { name: "Confirm" }).click();
    await expect(drawer).toContainText(
      "Radio write not yet fully verified: slot 127",
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Radio programming", exact: true })
      .click();
    await expect(drawer).toContainText(
      "Radio write not yet fully verified: slot 127",
    );
    await drawer
      .getByRole("button", { name: "Verify full radio image (read-only)" })
      .click();
    await expect(drawer).toContainText(
      "SUCCESS: memory 127 and the entire radio image match",
    );
    await drawer
      .getByText("Detailed channel cards and directory reports", {
        exact: true,
      })
      .click();
    console.log(
      "Simulated packaged USB UI passed: exact settings confirmation, cancel, persistent pending, explicit read-only verification. No radio writes sent.",
    );
  }
  await drawer
    .getByRole("button", { name: "Remove radio channel VE3RAD" })
    .click();
  await expect(drawer).toContainText("No radio channels saved yet");
  await drawer
    .getByText("Enter channels manually or import a channel list", {
      exact: true,
    })
    .click();
  const channelForm = drawer.getByRole("form", {
    name: "Manual radio channel",
  });
  await channelForm
    .getByLabel("Radio memory name (1–7 characters)")
    .fill("RXTEST");
  await channelForm.getByLabel("Receive frequency (MHz)").fill("162.55000");
  await channelForm.getByRole("checkbox").check();
  await channelForm
    .getByRole("button", { name: "Add channel to programming list" })
    .click();
  const manualCard = drawer.getByRole("region", {
    name: "Radio channel RXTEST",
  });
  await expect(manualCard).toContainText("Receive-only memory");
  await manualCard
    .getByRole("button", { name: "Edit channel frequencies/name" })
    .click();
  const editor = manualCard.getByRole("form", { name: "Manual radio channel" });
  await editor.getByLabel("Radio memory name (1–7 characters)").fill("EDITED");
  await editor
    .getByRole("button", { name: "Save edited channel (clears verification)" })
    .click();
  await expect(
    drawer.getByRole("region", { name: "Radio channel EDITED" }),
  ).toBeVisible();
  await drawer
    .getByRole("textbox", { name: "Channel entry CSV" })
    .fill("BULK1,146.52,146.52,none,FM,Test\nBULK2,162.55,off,none,NFM,Listen");
  await drawer
    .getByRole("button", { name: "Validate and preview channel list" })
    .click();
  await expect(drawer).toContainText("2 valid channel entries");
  await drawer
    .getByRole("button", {
      name: "Save 2 channels to private programming list",
    })
    .click();
  await expect(
    drawer.getByRole("region", { name: "Radio channel BULK2" }),
  ).toContainText("Receive-only memory");
  const inlineRow = drawer
    .getByRole("table", { name: "Saved channel programming list" })
    .getByRole("row", { name: "Channel row BULK1", exact: true });
  await inlineRow.getByRole("button", { name: "Edit inline" }).click();
  await inlineRow
    .getByRole("spinbutton", { name: "RX MHz for BULK1" })
    .fill("146.53");
  await inlineRow.getByRole("button", { name: "Save draft" }).click();
  await expect(inlineRow).toContainText("146.53000");
  await expect(inlineRow).toContainText("Draft / verify");
  console.log(
    "Manual entry, inline table editing, edit-with-verification-reset, and validated bulk channel capture passed.",
  );
  console.log(
    "Radio list smoke passed: offline cached repeater, private channel, reported tone, explicit verification, CSV availability, removal.",
  );
} finally {
  await app?.close();
  rmSync(directory, { recursive: true, force: true });
}
