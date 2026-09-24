import { _electron, expect } from "@playwright/test";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const root = mkdtempSync(path.join(os.tmpdir(), "oar-twelve-")),
  pictures = path.join(root, "Pictures");
mkdirSync(pictures);
let app;
try {
  app = await _electron.launch({
    ...(process.env.OAR_DESKTOP_EXECUTABLE
      ? { executablePath: process.env.OAR_DESKTOP_EXECUTABLE }
      : {}),
    args: [
      ...(process.env.OAR_DESKTOP_EXECUTABLE ? [] : ["."]),
      "--user-data-dir=" + path.join(root, "data"),
    ],
    env: { ...process.env, OAR_DEV_URL: "", OAR_SERVER_URL: "" },
  });
  await app.evaluate(
    ({ app }, folder) => app.setPath("pictures", folder),
    pictures,
  );
  const page = await app.firstWindow();
  await page
    .getByRole("button", { name: "Save application screenshot", exact: true })
    .click();
  await expect
    .poll(() => readdirSync(pictures).length, { timeout: 2500 })
    .toBe(1);
  const filename = readdirSync(pictures)[0];
  assert.match(filename, /^aroac-screenshot-\d{12}\.png$/);
  const image = readFileSync(path.join(pictures, filename));
  assert.equal(image.subarray(1, 4).toString(), "PNG");
  assert.ok(image.readUInt32BE(16) > 300);
  const backup = await page.evaluate(() =>
    window.oarDesktop.backup().then(
      () => null,
      (e) => e.message,
    ),
  );
  assert.match(backup, /Sign in/);
  console.log(
    "Native screenshot naming/output and signed-out backup protection passed.",
  );
} finally {
  await app?.close();
  rmSync(root, { recursive: true, force: true });
}
