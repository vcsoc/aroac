import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const {
  inspectImage,
  receiveOnlySlot,
  saveBackup,
} = require("../desktop/uv5r.cjs");

function image() {
  const data = Buffer.alloc(0x1948, 0xff);
  Buffer.from("aa307604000520dd", "hex").copy(data, 0);
  Buffer.from("HN5RV011", "ascii").copy(data, 0x1838);
  // Synthetic single valid 146.520 MHz memory and its name.
  receiveOnlySlot().block.copy(data, 8);
  receiveOnlySlot().name.copy(data, 0x1008);
  return data;
}

test("only the precise backed-up identification and firmware, plausible BCD and an unused slot 127 pass", () => {
  const data = image();
  const info = inspectImage(data);
  assert.equal(info.version, "HN5RV011");
  assert.equal(info.populated, 1);
  assert.equal(info.empty127, true);
  const channel = receiveOnlySlot();
  assert.equal(channel.block.subarray(0, 4).toString("hex"), "00206514");
  assert.equal(channel.block.subarray(4, 8).toString("hex"), "ffffffff");
  assert.equal(channel.name.toString("ascii", 0, 7), "OARTEST");
  for (const change of [
    (copy) => {
      copy[0] = 0x50;
    },
    (copy) => {
      copy[0x1838] = 0x42;
    },
    (copy) => {
      copy[8] = 0xfa;
    },
    (copy) => {
      channel.block.copy(copy, 8 + 127 * 16);
    },
  ]) {
    const copy = Buffer.from(data);
    change(copy);
    if (copy[8 + 127 * 16] === 0)
      assert.equal(inspectImage(copy).empty127, false);
    else assert.throws(() => inspectImage(copy));
  }
  assert.throws(() => inspectImage(data.subarray(0, -1)));
});

test("radio backup writes only a private, fsynced, hash-checked image", () => {
  const root = mkdtempSync(path.join(tmpdir(), "aroac-uv5r-backup-test-"));
  try {
    const backup = saveBackup(image(), path.join(root, "private"));
    assert.equal(statSync(path.join(root, "private")).mode & 0o777, 0o700);
    assert.equal(statSync(backup.filename).mode & 0o777, 0o600);
    assert.deepEqual(readFileSync(backup.filename), image());
    assert.equal(
      inspectImage(readFileSync(backup.filename)).sha256,
      backup.sha256,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
