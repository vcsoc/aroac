import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const {
  testAndRestoreSlot127,
  receiveOnlySlot,
  inspectImage,
  buildChannelBlocks,
  withVerifiedBackup,
} = require("../desktop/uv5r.cjs");
const {
  programOne,
  pendingStatus,
  verifyPending,
  restorePending,
} = require("../desktop/uv5r-session.cjs");
const IDENT = Buffer.from("aa307604000520dd", "hex");

function simulatedRadio({
  refuseFirstWrite = false,
  requirePowerCycle = false,
} = {}) {
  const image = Buffer.alloc(0x1948, 0xff);
  IDENT.copy(image);
  Buffer.from("HN5RV011").copy(image, 0x1838);
  receiveOnlySlot().block.copy(image, 8);
  receiveOnlySlot().name.copy(image, 0x1008);
  const original = Buffer.from(image);
  const writes = [];
  let sessions = 0,
    needsCycle = false;
  const bytesAt = (addr, size) => {
    if (addr === 0x1e80) return Buffer.alloc(size);
    const imageOffset = addr >= 0x1ec0 ? 0x1808 + addr - 0x1ec0 : 8 + addr;
    return image.subarray(imageOffset, imageOffset + size);
  };
  function portFactory() {
    sessions++;
    if (requirePowerCycle && needsCycle)
      return {
        flushInput() {},
        close() {},
        async write() {},
        async read() {
          throw Error(
            "Radio response timed out (1 bytes). Power-cycle the handset.",
          );
        },
      };
    let buffer = Buffer.alloc(0),
      magic = Buffer.alloc(0),
      state = "magic",
      readCount = 0;
    const append = (data) => {
      buffer = Buffer.concat([buffer, data]);
    };
    return {
      flushInput() {},
      close() {},
      async write(data) {
        if (state === "magic") {
          assert.equal(data.length, 1);
          magic = Buffer.concat([magic, data]);
          if (magic.length === 7) {
            assert.equal(magic.toString("hex"), "50bbff20120725");
            append(Buffer.from([6]));
            state = "ident-request";
          }
        } else if (state === "ident-request") {
          assert.deepEqual(data, Buffer.from([2]));
          append(IDENT);
          state = "ident-ack";
        } else if (state === "ident-ack") {
          assert.deepEqual(data, Buffer.from([6]));
          append(Buffer.from([6]));
          state = "ready";
        } else if (data[0] === 0x53 && data.length === 4) {
          const addr = data.readUInt16BE(1),
            size = data[3];
          assert.ok(addr === 0x1e80 || addr < 0x1800 || addr >= 0x1ec0);
          if (readCount++) append(Buffer.from([6]));
          append(
            Buffer.concat([
              Buffer.from([0x58, data[1], data[2], size]),
              bytesAt(addr, size),
            ]),
          );
        } else if (data[0] === 0x58 && data.length === 20) {
          const addr = data.readUInt16BE(1);
          assert.ok(
            addr === 0x07f0 || addr === 0x17f0,
            `unsafe write address ${addr.toString(16)}`,
          );
          assert.equal(data[3], 16);
          writes.push({ addr, bytes: Buffer.from(data.subarray(4)) });
          data.copy(image, 8 + addr, 4);
          if (requirePowerCycle) needsCycle = true;
          append(
            Buffer.from([refuseFirstWrite && writes.length === 1 ? 0x15 : 6]),
          );
        } else assert.deepEqual(data, Buffer.from([6])); // Read-block acknowledgement.
      },
      async read(size) {
        assert.ok(
          buffer.length >= size,
          "radio did not provide the expected bytes",
        );
        const result = Buffer.from(buffer.subarray(0, size));
        buffer = buffer.subarray(size);
        return result;
      },
    };
  }
  return {
    image,
    original,
    writes,
    portFactory,
    powerCycle: () => {
      needsCycle = false;
    },
    sessions: () => sessions,
  };
}

for (const refuseFirstWrite of [false, true]) {
  test(`slot-127 receive-only test ${refuseFirstWrite ? "restores even when write ACK is lost" : "writes only two blocks and restores independently"}`, async () => {
    const root = mkdtempSync(path.join(tmpdir(), "aroac-uv5r-protocol-"));
    try {
      const radio = simulatedRadio({ refuseFirstWrite });
      if (refuseFirstWrite)
        await assert.rejects(
          () => testAndRestoreSlot127("/dev/ttyUSB0", root, radio.portFactory),
          /restored and independently verified/,
        );
      else {
        const result = await testAndRestoreSlot127(
          "/dev/ttyUSB0",
          root,
          radio.portFactory,
        );
        assert.equal(result.restored, true);
        assert.equal(result.slot, 127);
      }
      assert.deepEqual(
        radio.image,
        radio.original,
        "original image must be restored byte-for-byte",
      );
      assert.equal(
        radio.sessions(),
        3,
        "reconnect before test-readback and after restoration",
      );
      assert.deepEqual(
        radio.writes.map((item) => item.addr),
        refuseFirstWrite ? [0x07f0, 0x07f0] : [0x07f0, 0x17f0, 0x07f0, 0x17f0],
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("a selected radio fingerprint mismatch prevents assignment, callback and all writes", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "aroac-radio-mismatch-"));
  try {
    const radio = simulatedRadio();
    let callback = false;
    await assert.rejects(
      () =>
        withVerifiedBackup(
          "/dev/ttyUSB0",
          root,
          async () => {
            callback = true;
          },
          radio.portFactory,
          "0".repeat(64),
        ),
      /fingerprint differs/,
    );
    assert.equal(callback, false);
    assert.equal(radio.writes.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const verifiedChannel = {
  id: 7,
  snapshot: {
    callsign: "VE3RAD",
    outputMHz: 146.94,
    mode: "FM",
    directoryStatus: "Unverified",
    restriction: "",
  },
  offsetMHz: -0.6,
  toneMode: "tone",
  txTone: "100.0",
  verified: true,
};

test("verified analog memory encodes exact RX/TX BCD, access tone, low power and name", () => {
  const c = buildChannelBlocks(verifiedChannel);
  assert.equal(c.block.toString("hex"), "00406914004063140000e80300000144");
  assert.equal(c.name.subarray(0, 7).toString("hex"), "564533524144ff");
  assert.equal(c.rxHz, 146_940_000);
  assert.equal(c.txHz, 146_340_000);
  assert.throws(() =>
    buildChannelBlocks({ ...verifiedChannel, verified: false }),
  );
  assert.throws(() =>
    buildChannelBlocks({ ...verifiedChannel, offsetMHz: -3 }),
  ); // TX below 144 MHz.
  assert.throws(() =>
    buildChannelBlocks({ ...verifiedChannel, txTone: "999.9" }),
  );
});

test("single-channel USB programming is backed up, owner-scoped, confirmed after full-image read, and cannot overwrite", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "aroac-uv5r-session-"));
  try {
    const radio = simulatedRadio({ requirePowerCycle: true });
    const pendingPath = path.join(root, "pending.json");
    const before = inspectImage(radio.image);
    const options = {
      device: "/dev/ttyUSB0",
      directory: root,
      pendingPath,
      owner: 41,
      row: verifiedChannel,
      slot: 127,
      expectedSha: before.sha256,
      portFactory: radio.portFactory,
    };
    const pending = await programOne(options);
    assert.equal(pending.stage, "awaiting-power-cycle");
    assert.equal(pending.slot, 127);
    assert.equal(pendingStatus(pendingPath, 41).callsign, "VE3RAD");
    assert.throws(
      () => pendingStatus(pendingPath, 42),
      /another local profile/i,
    );
    await assert.rejects(() => programOne(options), /pending radio write/);
    assert.notEqual(inspectImage(radio.image).sha256, before.sha256);
    assert.deepEqual(
      radio.writes.map((item) => item.addr),
      [0x07f0, 0x17f0],
    );
    await assert.rejects(
      () =>
        verifyPending({
          device: options.device,
          directory: root,
          pendingPath,
          owner: 41,
          portFactory: radio.portFactory,
        }),
      /Power-cycle/,
    );
    assert.equal(pendingStatus(pendingPath, 41).stage, "awaiting-power-cycle");
    radio.powerCycle();
    const verified = await verifyPending({
      device: options.device,
      directory: root,
      pendingPath,
      owner: 41,
      portFactory: radio.portFactory,
    });
    assert.equal(verified.state, "programmed");
    assert.equal(pendingStatus(pendingPath, 41), null);
    assert.equal(
      radio.image.subarray(8 + 127 * 16, 8 + 128 * 16).toString("hex"),
      "00406914004063140000e80300000144",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lost write ACK retains pending backup, detects partial channel and restores original only after explicit recovery", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "aroac-uv5r-recovery-"));
  try {
    const radio = simulatedRadio({
      refuseFirstWrite: true,
      requirePowerCycle: true,
    });
    const pendingPath = path.join(root, "pending.json");
    const options = {
      device: "/dev/ttyUSB0",
      directory: root,
      pendingPath,
      owner: 41,
      row: verifiedChannel,
      slot: 127,
      expectedSha: inspectImage(radio.image).sha256,
      portFactory: radio.portFactory,
    };
    await assert.rejects(() => programOne(options), /did not acknowledge/);
    assert.equal(pendingStatus(pendingPath, 41).stage, "writing");
    radio.powerCycle();
    const partial = await verifyPending({
      device: options.device,
      directory: root,
      pendingPath,
      owner: 41,
      portFactory: radio.portFactory,
    });
    assert.equal(partial.state, "mismatch");
    assert.equal(partial.restoreAllowed, true);
    const recovery = await restorePending({
      device: options.device,
      directory: root,
      pendingPath,
      owner: 41,
      portFactory: radio.portFactory,
    });
    assert.equal(recovery.state, "restore-awaiting-power-cycle");
    radio.powerCycle();
    const restored = await verifyPending({
      device: options.device,
      directory: root,
      pendingPath,
      owner: 41,
      portFactory: radio.portFactory,
    });
    assert.equal(restored.state, "restored");
    assert.deepEqual(radio.image, radio.original);
    assert.equal(pendingStatus(pendingPath, 41), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
