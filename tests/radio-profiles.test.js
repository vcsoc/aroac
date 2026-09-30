import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const {
  inspectImage,
  receiveOnlySlot,
  saveBackup,
  buildChannelBlocks,
} = require("../desktop/uv5r.cjs");
const {
  enroll,
  profiles,
  getProfile,
  backupDirectory,
  history,
} = require("../desktop/radio-profiles.cjs");
function image() {
  const data = Buffer.alloc(0x1948, 0xff);
  Buffer.from("aa307604000520dd", "hex").copy(data);
  Buffer.from("HN5RV011").copy(data, 0x1838);
  receiveOnlySlot().block.copy(data, 8);
  receiveOnlySlot().name.copy(data, 0x1008);
  return data;
}
test("radio fingerprint is stable across channel edits but changes with calibration; uniqueness is not claimed", () => {
  const first = image(),
    altered = Buffer.from(first);
  receiveOnlySlot().block.copy(altered, 8 + 7 * 16);
  assert.equal(
    inspectImage(first).fingerprint,
    inspectImage(altered).fingerprint,
  );
  assert.notEqual(inspectImage(first).sha256, inspectImage(altered).sha256);
  altered[0x1848] = 17;
  assert.notEqual(
    inspectImage(first).fingerprint,
    inspectImage(altered).fingerprint,
  );
  assert.equal(inspectImage(first).fingerprintIsUniqueSerial, false);
  assert.equal(inspectImage(first).memories[0].receiveOnly, true);
});
test("physical radio profiles isolate owner histories even when radios share the same protocol fingerprint", () => {
  const root = mkdtempSync(path.join(tmpdir(), "aroac-radio-profiles-"));
  try {
    const data = image();
    const a = enroll(
      root,
      1,
      { label: "Radio A", serial: "SERIAL-A", confirmPhysical: true },
      data,
    );
    const b = enroll(
      root,
      1,
      { label: "Radio B", serial: "SERIAL-B", confirmPhysical: true },
      data,
    );
    assert.notEqual(a.id, b.id);
    assert.equal(a.fingerprint, b.fingerprint);
    assert.equal(getProfile(root, 1, a.id).matchingSignatureProfiles, 1);
    assert.equal(b.matchingSignatureProfiles, 1);
    assert.deepEqual(profiles(root, 2), []);
    assert.throws(() => getProfile(root, 2, a.id), /not found/);
    assert.throws(
      () =>
        enroll(
          root,
          1,
          { label: "Duplicate", serial: "serial-a", confirmPhysical: true },
          data,
        ),
      /already/,
    );
    assert.throws(
      () => enroll(root, 1, { label: "Unknown", serial: "OTHER" }, data),
      /Confirm/,
    );
    const saved = saveBackup(data, backupDirectory(root, 1, a.id));
    assert.equal(history(root, 1, a.id).length, 1);
    assert.equal(history(root, 1, b.id).length, 0);
    assert.equal(history(root, 1, a.id)[0].sha256, inspectImage(data).sha256);
    assert.equal(statSync(saved.filename).mode & 0o777, 0o600);
    assert.equal(
      statSync(path.join(root, "radio-profiles.json")).mode & 0o777,
      0o600,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("manual receive-only capture cannot acquire transmit frequency/tone", () => {
  const row = {
    verified: true,
    snapshot: {
      callsign: "RX_ONLY",
      outputMHz: 162.55,
      mode: "NFM",
      receiveOnly: true,
    },
    offsetMHz: 0,
    toneMode: "none",
    txTone: null,
  };
  const encoded = buildChannelBlocks(row);
  assert.equal(encoded.txHz, null);
  assert.equal(encoded.block.subarray(4, 8).toString("hex"), "ffffffff");
  assert.throws(() =>
    buildChannelBlocks({ ...row, toneMode: "tone", txTone: "100.0" }),
  );
});
