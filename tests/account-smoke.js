import { _electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
const dir = mkdtempSync(path.join(tmpdir(), "oar-account-"));
let app, page;
const errors = [];
const png = readFileSync("public/icon-512.png");
const output = path.join(dir, "ownership.pdf");
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
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.getByRole("button", { name: "Add clock", exact: true }),
  ).toBeEnabled();
}
try {
  await launch();
  await page.evaluate(async () => {
    await window.oarDesktop.setOffline(true);
    await window.oarDesktop.request("/register", {
      method: "POST",
      body: JSON.stringify({
        callsign: "N1PROFILE",
        name: "Test Owner",
        email: "owner@example.test",
        password: "original-password-123",
      }),
    });
  });
  await page.reload();
  const connection = await page.evaluate(() => window.oarDesktop.connection());
  for (const suffix of ["", "-wal", "-shm"])
    assert.equal(
      statSync(connection.databasePath + suffix).mode & 0o777,
      0o600,
    );
  await page.locator(".profile-button").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".account-avatar-placeholder")).toBeVisible();
  assert.equal(
    await dialog
      .locator(".account-avatar-placeholder")
      .evaluate((el) => getComputedStyle(el).borderRadius),
    "50%",
  );
  await expect(dialog).toContainText("Logged in user");
  await dialog
    .getByRole("button", { name: "Edit profile", exact: true })
    .click();
  await dialog
    .getByLabel("Upload avatar")
    .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: png });
  await expect(dialog.getByRole("img", { name: "Your avatar" })).toBeVisible();
  const drop = await page.evaluateHandle(
    (bytes) => {
      const dt = new DataTransfer();
      dt.items.add(
        new File([new Uint8Array(bytes)], "dropped.png", { type: "image/png" }),
      );
      return dt;
    },
    [...png],
  );
  await dialog
    .locator(".account-avatar-drop")
    .dispatchEvent("drop", { dataTransfer: drop });
  await expect(dialog.getByRole("status")).toContainText("Avatar saved");
  assert.equal(
    await dialog
      .locator("img.account-avatar")
      .evaluate((el) => getComputedStyle(el).borderRadius),
    "50%",
  );
  await drop.dispose();
  await dialog.getByLabel("First name", { exact: true }).fill("Zoë");
  await dialog.getByLabel("Last name", { exact: true }).fill("Tester");
  await dialog
    .getByLabel("Display name (local directory)", { exact: true })
    .fill("Jörg Owner");
  await dialog
    .getByLabel("Mobile number", { exact: true })
    .fill("+15551234567");
  await dialog
    .getByRole("button", { name: "Save profile", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Profile saved.");
  await dialog
    .locator("summary")
    .filter({ hasText: "Change password" })
    .click();
  await dialog
    .getByLabel("Current password", { exact: true })
    .fill("original-password-123");
  await dialog
    .getByLabel("New password", { exact: true })
    .fill("updated-password-123");
  await dialog
    .getByLabel("Confirm password", { exact: true })
    .fill("updated-password-123");
  await dialog
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Password changed");
  await expect(
    dialog.getByLabel("Current password", { exact: true }),
  ).toHaveValue("");
  await page.screenshot({ path: "/tmp/oar-profile-editor.png" });
  await dialog.evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: "/tmp/oar-profile-layout.png" });
  await dialog.getByRole("button", { name: "My devices", exact: true }).click();
  await dialog.getByRole("button", { name: "Add device", exact: true }).click();
  for (const [name, value] of [
    ["Device name", "My HF transceiver"],
    ["Manufacturer", "Example"],
    ["Model", "HF-100"],
    ["Serial number", "SERIAL-123"],
    ["Purchase date", "2026-01-15"],
    ["Supplier", "Local radio shop"],
    ["Purchase price", "1250.00"],
    ["Currency", "CAD"],
    ["Warranty expiry", "2028-01-15"],
    ["Notes / specifications", "Owner-entered fixture; 100 W HF radio"],
  ])
    await dialog.getByLabel(name, { exact: true }).fill(value);
  await dialog
    .getByRole("button", { name: "Save device", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "My HF transceiver", exact: true }),
  ).toBeVisible();
  await dialog.locator("summary").filter({ hasText: "Invoices (0)" }).click();
  await dialog
    .getByLabel("Invoice for My HF transceiver", { exact: true })
    .setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: png });
  await expect(dialog).toContainText("receipt.png");
  const invoice = await PDFDocument.create();
  invoice.addPage();
  const pdfBytes = Buffer.from(await invoice.save());
  await dialog
    .getByLabel("Invoice for My HF transceiver", { exact: true })
    .setInputFiles({
      name: "receipt.pdf",
      mimeType: "application/pdf",
      buffer: pdfBytes,
    });
  await expect(dialog).toContainText("receipt.pdf");
  const jpg64 = await page.evaluate(async (data) => {
    const image = await createImageBitmap(
      await (await fetch("data:image/png;base64," + data)).blob(),
    );
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d").drawImage(image, 0, 0);
    image.close();
    return canvas.toDataURL("image/jpeg").split(",")[1];
  }, png.toString("base64"));
  const jpg = Buffer.from(jpg64, "base64");
  await dialog
    .getByLabel("Invoice for My HF transceiver", { exact: true })
    .setInputFiles({
      name: "receipt.jpg",
      mimeType: "image/jpeg",
      buffer: jpg,
    });
  await expect(dialog).toContainText("receipt.jpg");
  await app.evaluate(({ dialog }, output) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: output });
  }, output);
  await dialog
    .getByRole("button", { name: "Export all devices to PDF", exact: true })
    .click();
  await expect(
    dialog.getByRole("status").filter({ hasText: "PDF saved:" }),
  ).toBeVisible({ timeout: 45000 });
  const document = await PDFDocument.load(readFileSync(output));
  assert.ok(document.getPageCount() >= 3);
  const files = document.catalog
    .lookup(PDFName.of("Names"), PDFDict)
    .lookup(PDFName.of("EmbeddedFiles"), PDFDict)
    .lookup(PDFName.of("Names"), PDFArray);
  const decoded = {};
  for (let i = 0; i < files.size(); i += 2) {
    const name = files.lookup(i).decodeText();
    const spec = files.lookup(i + 1, PDFDict);
    const stream = spec
      .lookup(PDFName.of("EF"), PDFDict)
      .lookup(PDFName.of("F"), PDFRawStream);
    decoded[name] = Buffer.from(decodePDFRawStream(stream).decode());
  }
  assert.deepEqual(
    Object.values(decoded).find((b) => b.equals(png)),
    png,
  );
  assert.deepEqual(
    Object.values(decoded).find((b) => b.equals(jpg)),
    jpg,
  );
  assert.deepEqual(
    Object.values(decoded).find((b) => b.equals(pdfBytes)),
    pdfBytes,
  );
  const metadata = JSON.parse(decoded["ownership-record.json"]);
  assert.equal(metadata.account.firstName, "Zoë");
  assert.equal(metadata.devices[0].serial, "SERIAL-123");
  assert.equal(metadata.account.password, undefined);
  assert.equal(statSync(output).mode & 0o777, 0o600);
  await page.screenshot({ path: "/tmp/oar-device-inventory.png" });
  await app.close();
  app = null;
  await launch();
  await page.evaluate(() =>
    window.oarDesktop.request("/login", {
      method: "POST",
      body: JSON.stringify({
        callsign: "N1PROFILE",
        password: "updated-password-123",
      }),
    }),
  );
  await page.reload();
  await page.locator(".profile-button").click();
  await expect(page.getByRole("img", { name: "Your avatar" })).toBeVisible();
  const persisted = await page.evaluate(async () => ({
    account: await window.oarDesktop.request("/account"),
    devices: await window.oarDesktop.request("/devices"),
  }));
  assert.equal(persisted.account.mobile, "+15551234567");
  assert.equal(persisted.devices[0].invoices.length, 3);
  await page.getByRole("button", { name: "Logout", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.oarDesktop.request("/me")))
    .toBe(null);
  assert.deepEqual(errors, []);
  console.log(
    "Account passed: user panel, avatar upload, private profile edits, password change, device/invoice SQLite persistence, native PDF with intact original invoice attachments and UTF-8 metadata, owner-only file permissions and logout.",
  );
} catch (e) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: "/tmp/oar-account-failure.png" });
    console.error((await page.locator("body").innerText()).slice(-6500));
  }
  throw e;
} finally {
  await app?.close();
  rmSync(dir, { recursive: true, force: true });
}
