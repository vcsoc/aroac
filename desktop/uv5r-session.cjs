// Model-gated, one-channel-at-a-time UV-5R programming transaction.
// The radio must be manually power-cycled after writing before a separate
// read-only, full-image verification. No blind retries or background uploads.
const fs = require("node:fs");
const { randomBytes, createHash } = require("node:crypto");
const {
  withVerifiedBackup,
  inspectImage,
  buildChannelBlocks,
  writeChannelBlock,
} = require("./uv5r.cjs");

const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
const addresses = (slot) => [8 + slot * 16, 8 + 0x1000 + slot * 16];
function loadPending(filename) {
  try {
    if (fs.lstatSync(filename).isSymbolicLink())
      throw Error("Radio transaction path cannot be a symlink.");
    const pending = JSON.parse(fs.readFileSync(filename, "utf8"));
    if (
      !pending ||
      pending.format !== 1 ||
      !Number.isInteger(pending.slot) ||
      pending.slot < 0 ||
      pending.slot >= 128 ||
      !Number.isSafeInteger(pending.owner) ||
      !/^[a-f0-9]{64}$/.test(pending.baselineHash) ||
      !/^[a-f0-9]{64}$/.test(pending.expectedHash) ||
      ![
        "writing",
        "awaiting-power-cycle",
        "restore-awaiting-power-cycle",
        "mismatch",
      ].includes(pending.stage)
    )
      throw Error(
        "Radio transaction metadata is invalid; do not write to the radio.",
      );
    return pending;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
function savePending(filename, value) {
  const temporary = filename + ".tmp-" + randomBytes(12).toString("hex");
  try {
    const fd = fs.openSync(
      temporary,
      fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW |
        fs.constants.O_WRONLY,
      0o600,
    );
    try {
      fs.writeFileSync(fd, JSON.stringify(value));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, filename);
  } catch (error) {
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      /* Preserve original error. */
    }
    throw error;
  }
}
function forOwner(filename, owner) {
  const pending = loadPending(filename);
  if (pending && pending.owner !== owner)
    throw Error(
      "An unverified radio write belongs to another local profile. Sign in to that profile to resolve it.",
    );
  return pending;
}
function publicPending(pending) {
  if (!pending) return null;
  return {
    slot: pending.slot,
    callsign: pending.callsign,
    stage: pending.stage,
    rxMHz: pending.rxHz / 1_000_000,
    txMHz: pending.txHz === null ? null : pending.txHz / 1_000_000,
    tone: pending.tone,
    mode: pending.mode,
    started: pending.started,
    backupFile: pending.baselineFile,
    device: pending.device,
    radioId: pending.radioId,
    fingerprint: pending.fingerprint,
  };
}
function pendingStatus(filename, owner) {
  return publicPending(forOwner(filename, owner));
}

async function programOne({
  device,
  cable,
  directory,
  pendingPath,
  owner,
  row,
  slot,
  expectedSha,
  portFactory,
  beforeWrite,
  radioId,
  expectedFingerprint,
}) {
  if (forOwner(pendingPath, owner))
    throw Error(
      "Verify or restore the existing pending radio write before programming again.",
    );
  if (
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= 128 ||
    !/^[a-f0-9]{64}$/.test(expectedSha || "")
  )
    throw Error(
      "Read and back up the connected radio, then select an empty memory slot.",
    );
  const channel = buildChannelBlocks(row);
  return withVerifiedBackup(
    device,
    directory,
    async ({ port, image, backup }) => {
      if (forOwner(pendingPath, owner))
        throw Error(
          "Another radio operation became pending. No write was sent.",
        );
      if (backup.sha256 !== expectedSha)
        throw Error(
          "Radio changed since inspection. Read it again before programming; no write was sent.",
        );
      if (!backup.emptySlots.includes(slot))
        throw Error(
          "Chosen memory slot is occupied or has unexpected name bytes. No write was sent.",
        );
      const [memoryAt, nameAt] = addresses(slot);
      const expected = Buffer.from(image);
      channel.block.copy(expected, memoryAt);
      channel.name.copy(expected, nameAt);
      if (beforeWrite) await beforeWrite();
      const pending = {
        format: 1,
        stage: "writing",
        owner,
        slot,
        device,
        cable,
        radioId,
        fingerprint: backup.fingerprint,
        started: new Date().toISOString(),
        baselineFile: backup.filename,
        baselineHash: backup.sha256,
        expectedHash: hash(expected),
        memoryHex: channel.block.toString("hex"),
        nameHex: channel.name.toString("hex"),
        callsign: channel.label,
        rxHz: channel.rxHz,
        txHz: channel.txHz,
        tone: channel.tone,
        mode: channel.mode,
      };
      // Fsync the *full* unmodified image and the pending record before the
      // first write: after an ACK timeout the radio may already have changed.
      savePending(pendingPath, pending);
      await writeChannelBlock(port, slot, "memory", channel.block);
      await writeChannelBlock(port, slot, "name", channel.name);
      pending.stage = "awaiting-power-cycle";
      savePending(pendingPath, pending);
      return publicPending(pending);
    },
    portFactory,
    expectedFingerprint,
  );
}

function differsOnlyInSlot(current, baseline, slot) {
  const [memoryAt, nameAt] = addresses(slot);
  for (let index = 0; index < baseline.length; index++) {
    if (
      (index >= memoryAt && index < memoryAt + 16) ||
      (index >= nameAt && index < nameAt + 16)
    )
      continue;
    if (current[index] !== baseline[index]) return false;
  }
  return true;
}
function baselineFor(pending) {
  if (
    typeof pending.baselineFile !== "string" ||
    !pending.baselineFile.endsWith(".img") ||
    fs.lstatSync(pending.baselineFile).isSymbolicLink()
  )
    throw Error("Radio backup file is missing or unsafe; no write was sent.");
  const baseline = fs.readFileSync(pending.baselineFile);
  if (
    hash(baseline) !== pending.baselineHash ||
    !inspectImage(baseline).emptySlots.includes(pending.slot)
  )
    throw Error(
      "Private backup changed or slot was not empty; no write was sent.",
    );
  return baseline;
}

async function verifyPending({
  device,
  cable,
  directory,
  pendingPath,
  owner,
  portFactory,
}) {
  const pending = forOwner(pendingPath, owner);
  if (!pending) throw Error("No pending radio write to verify.");
  if (pending.cable ? cable !== pending.cable : device !== pending.device)
    throw Error("Use the same USB-serial cable to verify this operation.");
  return withVerifiedBackup(
    device,
    directory,
    async ({ image, backup }) => {
      const expected =
        pending.stage === "restore-awaiting-power-cycle"
          ? pending.baselineHash
          : pending.expectedHash;
      if (backup.sha256 === expected) {
        fs.unlinkSync(pendingPath);
        return {
          state:
            pending.stage === "restore-awaiting-power-cycle"
              ? "restored"
              : "programmed",
          backupFile: backup.filename,
          slot: pending.slot,
          sha256: backup.sha256,
        };
      }
      if (backup.sha256 === pending.baselineHash) {
        fs.unlinkSync(pendingPath);
        return {
          state: "unchanged",
          backupFile: backup.filename,
          slot: pending.slot,
          sha256: backup.sha256,
        };
      }
      const original = baselineFor(pending);
      pending.stage = "mismatch";
      savePending(pendingPath, pending);
      return {
        state: "mismatch",
        backupFile: backup.filename,
        slot: pending.slot,
        sha256: backup.sha256,
        restoreAllowed: differsOnlyInSlot(image, original, pending.slot),
      };
    },
    portFactory,
    pending.fingerprint,
  );
}

async function restorePending({
  device,
  cable,
  directory,
  pendingPath,
  owner,
  portFactory,
}) {
  const pending = forOwner(pendingPath, owner);
  if (
    !pending ||
    !["mismatch", "writing", "awaiting-power-cycle"].includes(pending.stage)
  )
    throw Error("No unresolved radio write to restore.");
  if (pending.cable ? cable !== pending.cable : pending.device !== device)
    throw Error("Use the original USB-serial cable.");
  const original = baselineFor(pending);
  return withVerifiedBackup(
    device,
    directory,
    async ({ port, image, backup }) => {
      if (!differsOnlyInSlot(image, original, pending.slot))
        throw Error(
          "Radio changed outside this channel; refusing to restore unrelated settings.",
        );
      const [memoryAt, nameAt] = addresses(pending.slot);
      const originalMemory = original.subarray(memoryAt, memoryAt + 16);
      const originalName = original.subarray(nameAt, nameAt + 16);
      const proposedMemory = Buffer.from(pending.memoryHex, "hex");
      const proposedName = Buffer.from(pending.nameHex, "hex");
      if (
        proposedMemory.length !== 16 ||
        proposedName.length !== 16 ||
        ![originalMemory, proposedMemory].some((value) =>
          image.subarray(memoryAt, memoryAt + 16).equals(value),
        ) ||
        ![originalName, proposedName].some((value) =>
          image.subarray(nameAt, nameAt + 16).equals(value),
        )
      )
        throw Error(
          "Channel is neither original nor the planned write; restoration requires manual inspection.",
        );
      if (backup.sha256 === pending.baselineHash) {
        fs.unlinkSync(pendingPath);
        return {
          state: "restored",
          backupFile: backup.filename,
          slot: pending.slot,
        };
      }
      // Status is written before either memory write so a lost ACK cannot
      // erase the evidence that restoration might already be in progress.
      pending.stage = "restore-awaiting-power-cycle";
      savePending(pendingPath, pending);
      if (!image.subarray(memoryAt, memoryAt + 16).equals(originalMemory))
        await writeChannelBlock(port, pending.slot, "memory", originalMemory);
      if (!image.subarray(nameAt, nameAt + 16).equals(originalName))
        await writeChannelBlock(port, pending.slot, "name", originalName);
      return {
        state: "restore-awaiting-power-cycle",
        backupFile: backup.filename,
        slot: pending.slot,
      };
    },
    portFactory,
    pending.fingerprint,
  );
}

module.exports = {
  programOne,
  pendingStatus,
  verifyPending,
  restorePending,
  buildChannelBlocks,
};
