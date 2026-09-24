import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const image = (file) => readFileSync(file);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
test("AROAC source logo, desktop icons, iOS asset and license are consistent", () => {
  assert.equal(
    digest(image("public/aroac-logo.png")),
    "3efb1a154a124689164f35517f0fd9c66a25ae8045395ee15a9e17e54e5c3803",
  );
  for (const [file, expected] of [
    ["public/icon-192.png", "192x192"],
    ["public/icon-512.png", "512x512"],
    [
      "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
      "1024x1024",
    ],
  ]) {
    const bytes = image(file);
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(
      `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,
      expected,
    );
  }
  assert.equal(
    image("public/icon.ico").subarray(0, 4).toString("hex"),
    "00000100",
  );
  assert.equal(image("public/icon.icns").subarray(0, 4).toString(), "icns");
  assert.match(
    readFileSync("public/icon.svg", "utf8"),
    /data:image\/png;base64,/,
  );
  assert.match(
    readFileSync("LICENSE", "utf8"),
    /^AROAC Free Noncommercial Use License/m,
  );
  assert.match(readFileSync("roadmap.md", "utf8"), /^# AROAC Roadmap/m);
});
