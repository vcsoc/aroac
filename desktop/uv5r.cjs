// Linux-only UV-5R clone transport. Memory writes are deliberately limited to
// the specifically authorized receive-only slot-127 test and its restoration.
// No CHIRP code is included; protocol values are interoperability facts.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash, randomBytes } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");

const MAGIC = Buffer.from("50bbff20120725", "hex");
const IDENT = Buffer.from("aa307604000520dd", "hex");
const FIRMWARE = "HN5RV011";
const ACK = Buffer.from([6]);
const SLOT = 127;
const SLOT_MAIN = SLOT * 16;
const SLOT_NAME = 0x1000 + SLOT * 16;
const IMAGE_LENGTH = 0x1948;
const STTY = "/usr/bin/stty";
const validPort = (device) =>
  typeof device === "string" && /^\/dev\/ttyUSB\d+$/.test(device);
const digest = (data) => createHash("sha256").update(data).digest("hex");

class RadioPort {
  constructor(device) {
    if (process.platform !== "linux" || !validPort(device))
      throw Error("Only a selected Linux USB-serial cable is supported.");
    if (!fs.existsSync(STTY))
      throw Error("Linux stty is required to configure the cable.");
    this.device = device;
    this.fd = fs.openSync(
      device,
      fs.constants.O_RDWR | fs.constants.O_NOCTTY | fs.constants.O_NONBLOCK,
    );
    try {
      this.original = execFileSync(STTY, ["-F", device, "-g"], {
        timeout: 3000,
        encoding: "utf8",
      }).trim();
      execFileSync(
        STTY,
        [
          "-F",
          device,
          "9600",
          "raw",
          "-echo",
          "-ixon",
          "-ixoff",
          "-crtscts",
          "cs8",
          "-parenb",
          "-cstopb",
          "clocal",
          "cread",
          "min",
          "0",
          "time",
          "0",
        ],
        { timeout: 3000, stdio: "ignore" },
      );
    } catch {
      this.close();
      throw Error("Could not configure the serial port for 9600 baud, 8N1.");
    }
  }
  close() {
    if (this.fd === undefined) return;
    try {
      if (this.original)
        execFileSync(STTY, ["-F", this.device, this.original], {
          timeout: 3000,
          stdio: "ignore",
        });
    } catch {
      /* Unplugged cable; original configuration cannot be restored. */
    }
    fs.closeSync(this.fd);
    this.fd = undefined;
  }
  async write(data) {
    let offset = 0;
    const deadline = Date.now() + 2000;
    while (offset < data.length) {
      if (Date.now() > deadline)
        throw Error("Serial cable did not accept control bytes.");
      try {
        offset += fs.writeSync(this.fd, data, offset, data.length - offset);
      } catch (error) {
        if (error.code !== "EAGAIN") throw error;
      }
      if (offset < data.length) await delay(3);
    }
  }
  async read(count, timeout = 2000) {
    const result = Buffer.alloc(count);
    const deadline = Date.now() + timeout;
    let offset = 0;
    while (offset < count) {
      if (Date.now() > deadline)
        throw Error(`Radio response timed out (${count} bytes).`);
      try {
        const size = fs.readSync(this.fd, result, offset, count - offset, null);
        if (size) {
          offset += size;
          continue;
        }
      } catch (error) {
        if (error.code !== "EAGAIN") throw error;
      }
      await delay(3);
    }
    return result;
  }
  flushInput() {
    // The first bytes of a new handshake can be preceded by idle cable noise.
    const buffer = Buffer.alloc(256);
    for (let i = 0; i < 8; i++) {
      try {
        if (!fs.readSync(this.fd, buffer, 0, buffer.length, null)) break;
      } catch (error) {
        if (error.code === "EAGAIN") break;
        throw error;
      }
    }
  }
}

async function identify(port) {
  port.flushInput();
  for (const byte of MAGIC) {
    await port.write(Buffer.from([byte]));
    await delay(10);
  }
  const ack = await port.read(1, 1000);
  if (!ack.equals(ACK))
    throw Error("Radio refused the UV-5R identification request.");
  await port.write(Buffer.from([2]));
  const ident = [];
  for (let n = 0; n < 12; n++) {
    const byte = (await port.read(1, 1000))[0];
    ident.push(byte);
    if (byte === 0xdd) break;
  }
  if (!Buffer.from(ident).equals(IDENT))
    throw Error(
      "Radio identification differs from the backed-up handset; refusing to continue.",
    );
  await port.write(ACK);
  if (!(await port.read(1, 1000)).equals(ACK))
    throw Error("Radio refused the clone handshake.");
  return Buffer.from(ident);
}

async function readBlock(port, address, size = 0x40, first = false) {
  if (
    !Number.isInteger(address) ||
    address < 0 ||
    address + size > 0x2000 ||
    ![0x10, 0x40].includes(size)
  )
    throw Error("Unsafe read range.");
  const command = Buffer.from([0x53, address >> 8, address & 255, size]); // 'S': read, never write.
  await port.write(command);
  if (!first && !(await port.read(1)).equals(ACK))
    throw Error(`Radio refused read at 0x${address.toString(16)}.`);
  const header = await port.read(4);
  if (!header.equals(Buffer.from([0x58, address >> 8, address & 255, size])))
    throw Error("Radio returned an unexpected read header.");
  const data = await port.read(size);
  await port.write(ACK);
  await delay(50);
  return data;
}

async function readImage(port, ident, first = false) {
  await readBlock(port, 0x1e80, 0x40, first); // Known aux-read workaround; not copied into image.
  const versionBlock = await readBlock(port, 0x1ec0);
  const finalAux = await readBlock(port, 0x1fc0);
  const shortFinalAux = finalAux[15] === 0xff;
  const main = [];
  for (let addr = 0; addr < 0x1800; addr += 0x40)
    main.push(await readBlock(port, addr));
  const aux = [];
  for (let addr = 0x1ec0; addr < 0x1fc0; addr += 0x40)
    aux.push(await readBlock(port, addr));
  for (let addr = 0x1fc0; addr < 0x2000; addr += shortFinalAux ? 0x10 : 0x40)
    aux.push(await readBlock(port, addr, shortFinalAux ? 0x10 : 0x40));
  const image = Buffer.concat([ident, ...main, ...aux]);
  if (
    image.length !== IMAGE_LENGTH ||
    !image.subarray(0x1808, 0x1848).equals(versionBlock)
  )
    throw Error("Incomplete or inconsistent clone image.");
  return image;
}

function inspectImage(image) {
  if (
    !Buffer.isBuffer(image) ||
    image.length !== IMAGE_LENGTH ||
    !image.subarray(0, 8).equals(IDENT)
  )
    throw Error("Unsupported UV-5R clone image.");
  const version = image
    .subarray(0x1838, 0x1846)
    .toString("latin1")
    .replace(/[\x00\xff]+$/g, "");
  if (version !== FIRMWARE)
    throw Error(
      "Radio firmware differs from the verified backup; writing is disabled.",
    );
  let populated = 0;
  const memories = [];
  for (let i = 0; i < 128; i++) {
    const block = image.subarray(8 + i * 16, 24 + i * 16);
    if (block[0] === 0xff) continue;
    populated++;
    for (const value of block.subarray(0, 4))
      if ((value & 15) > 9 || Math.floor(value / 16) > 9)
        throw Error("Channel table does not match UV-5R BCD format.");
    const digits = Array.from(block.subarray(0, 4)).flatMap((byte) => [
      byte & 15,
      byte >> 4,
    ]);
    const hz =
      digits.reduce((total, digit, place) => total + digit * 10 ** place, 0) *
      10;
    if (!(
      (hz >= 130_000_000 && hz <= 176_000_000) ||
      (hz >= 400_000_000 && hz <= 520_000_000)
    ))
      throw Error("Unrecognized programmed channel frequency.");
    const txRaw = block.subarray(4, 8);
    const receiveOnly = txRaw.every((byte) => byte === 0xff);
    const txDigits = Array.from(txRaw).flatMap((byte) => [
      byte & 15,
      byte >> 4,
    ]);
    const txHz =
      receiveOnly || txDigits.some((digit) => digit > 9)
        ? null
        : txDigits.reduce(
            (total, digit, place) => total + digit * 10 ** place,
            0,
          ) * 10;
    const txTone = block.readUInt16LE(10),
      rxTone = block.readUInt16LE(8);
    const tone = [0, 0xffff].includes(txTone)
      ? "none"
      : (txTone / 10).toFixed(1);
    const rawName = image.subarray(
      8 + 0x1000 + i * 16,
      8 + 0x1000 + i * 16 + 7,
    );
    const name = Array.from(rawName)
      .filter((byte) => byte !== 0xff && byte !== 0)
      .map((byte) => String.fromCharCode(byte))
      .join("");
    const inEntryBand = (frequency) =>
      (frequency >= 136_000_000 && frequency <= 174_000_000) ||
      (frequency >= 400_000_000 && frequency <= 520_000_000);
    const supported =
      inEntryBand(hz) &&
      (receiveOnly ||
        (txHz !== null &&
          inEntryBand(txHz) &&
          Math.abs(txHz - hz) <= 10_000_000)) &&
      [0, 0xffff].includes(rxTone) &&
      (tone === "none" || VALID_TONES.has(tone)) &&
      (!receiveOnly || tone === "none");
    memories.push({
      slot: i,
      name: name || `CH${i}`,
      rxMHz: hz / 1_000_000,
      txMHz: txHz === null ? null : txHz / 1_000_000,
      receiveOnly,
      tone,
      mode: block[15] & 0x40 ? "FM" : "NFM",
      supportedForCapture: supported,
      warning: supported
        ? "Capture is unverified; confirm all settings before programming."
        : "Unsupported RX tone/DCS or frequency encoding; displayed only, not silently converted.",
    });
  }
  const emptySlots = [];
  for (let slot = 0; slot < 128; slot++) {
    const memory = image.subarray(8 + slot * 16, 8 + (slot + 1) * 16);
    const name = image.subarray(
      8 + 0x1000 + slot * 16,
      8 + 0x1000 + (slot + 1) * 16,
    );
    if (
      memory.every((byte) => byte === 0xff) &&
      name.every((byte) => byte === 0xff)
    )
      emptySlots.push(slot);
  }
  return {
    version,
    populated,
    memories,
    empty127: emptySlots.includes(SLOT),
    emptySlots,
    sha256: digest(image),
    fingerprint: digest(
      Buffer.concat([
        Buffer.from("aroac-uv5r-calibration-v1\0"),
        image.subarray(0, 8),
        image.subarray(0x1838, 0x1846),
        image.subarray(0x1848, 0x18a8),
        image.subarray(0x18b8, 0x18c8),
        image.subarray(0x18d8, 0x1908),
      ]),
    ),
    fingerprintVersion: 1,
    fingerprintIsUniqueSerial: false,
  };
}

function saveBackup(image, directory) {
  const info = inspectImage(image);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "Z");
  const filename = path.join(
    directory,
    `uv5r-readonly-${stamp}-${info.sha256.slice(0, 12)}-${randomBytes(4).toString("hex")}.img`,
  );
  const temporary = path.join(
    directory,
    `.pending-${randomBytes(12).toString("hex")}`,
  );
  try {
    const fd = fs.openSync(
      temporary,
      fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_WRONLY |
        fs.constants.O_NOFOLLOW,
      0o600,
    );
    try {
      fs.writeFileSync(fd, image);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, filename);
  } catch (error) {
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      /* Preserve the original error. */
    }
    throw error;
  }
  const metadata = filename.replace(/\.img$/, ".json");
  fs.writeFileSync(
    metadata,
    JSON.stringify(
      {
        ...info,
        imageBytes: image.length,
        readTwiceIdentical: true,
        created: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  return { ...info, filename };
}

async function withVerifiedBackup(
  device,
  directory,
  action,
  portFactory,
  expectedFingerprint,
) {
  const port = portFactory ? portFactory(device) : new RadioPort(device);
  try {
    const ident = await identify(port);
    const first = await readImage(port, ident, true);
    const second = await readImage(port, ident);
    if (!first.equals(second))
      throw Error("Two full radio reads disagree; no writing is permitted.");
    if (
      expectedFingerprint &&
      inspectImage(first).fingerprint !== expectedFingerprint
    )
      throw Error(
        "Connected radio fingerprint differs from the selected radio profile. No write was sent and no backup was assigned to that radio.",
      );
    const backup = saveBackup(first, directory);
    return await action({ port, image: first, backup });
  } finally {
    port.close();
  }
}

// Only the two 16-byte blocks comprising the approved test slot may be written.
// No other memory, settings, aux, or firmware region is writable through this API.
async function writeTestBlock(port, address, payload) {
  if (
    ![SLOT_MAIN, SLOT_NAME].includes(address) ||
    !Buffer.isBuffer(payload) ||
    payload.length !== 16
  )
    throw Error("Only approved slot-127 blocks may be changed.");
  await port.write(
    Buffer.concat([
      Buffer.from([0x58, address >> 8, address & 255, 16]),
      payload,
    ]),
  );
  await delay(50);
  if (!(await port.read(1)).equals(ACK))
    throw Error(
      "Radio refused slot-127 write; stop and inspect before retrying.",
    );
}

async function writeChannelBlock(port, slot, kind, payload) {
  if (
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= 128 ||
    !["memory", "name"].includes(kind) ||
    !Buffer.isBuffer(payload) ||
    payload.length !== 16
  )
    throw Error("Unsafe UV-5R channel write request.");
  const address = slot * 16 + (kind === "name" ? 0x1000 : 0);
  await port.write(
    Buffer.concat([
      Buffer.from([0x58, address >> 8, address & 255, 16]),
      payload,
    ]),
  );
  await delay(50);
  if (!(await port.read(1)).equals(ACK))
    throw Error(
      "Radio did not acknowledge the write. Do not retry; power-cycle and verify the pending operation.",
    );
}

function encodeBcdHz(hz) {
  if (
    !Number.isSafeInteger(hz) ||
    hz % 10 !== 0 ||
    !(
      (hz >= 130_000_000 && hz <= 176_000_000) ||
      (hz >= 400_000_000 && hz <= 520_000_000)
    )
  )
    throw Error(
      "Frequency outside the validated UV-5R memory ranges or not on a 10 Hz step.",
    );
  let value = hz / 10;
  const result = Buffer.alloc(4);
  for (let i = 0; i < result.length; i++) {
    result[i] = value % 10;
    value = Math.floor(value / 10);
    result[i] |= (value % 10) << 4;
    value = Math.floor(value / 10);
  }
  if (value !== 0) throw Error("Receive frequency exceeds UV-5R BCD storage.");
  return result;
}

const VALID_TONES = new Set(
  "67.0 69.3 71.9 74.4 77.0 79.7 82.5 85.4 88.5 91.5 94.8 97.4 100.0 103.5 107.2 110.9 114.8 118.8 123.0 127.3 131.8 136.5 141.3 146.2 151.4 156.7 159.8 162.2 165.5 167.9 171.3 173.8 177.3 179.9 183.5 186.2 189.9 192.8 196.6 199.5 203.5 206.5 210.7 218.1 225.7 229.1 233.6 241.8 250.3 254.1".split(
    " ",
  ),
);
function buildChannelBlocks(row) {
  const c = row?.snapshot;
  if (
    !row?.verified ||
    !c ||
    c.restriction ||
    c.directoryStatus === "Reported offline" ||
    !["FM", "NFM"].includes(c.mode) ||
    !["tone", "none"].includes(row.toneMode) ||
    !Number.isFinite(c.outputMHz) ||
    !Number.isFinite(row.offsetMHz) ||
    Math.abs(row.offsetMHz) > 10 ||
    (row.toneMode === "tone" && !VALID_TONES.has(row.txTone))
  )
    throw Error(
      "Channel must be verified, open, analog, and have valid offset and CTCSS settings.",
    );
  const rx = c.outputMHz * 1_000_000;
  const tx = (c.outputMHz + row.offsetMHz) * 1_000_000;
  const rxHz = Math.round(rx),
    txHz = Math.round(tx);
  if (
    Math.abs(rx - rxHz) > 0.0001 ||
    Math.abs(tx - txHz) > 0.0001 ||
    rxHz % 10 ||
    txHz % 10 ||
    !(
      (rxHz >= 136_000_000 && rxHz <= 174_000_000) ||
      (rxHz >= 400_000_000 && rxHz <= 520_000_000)
    ) ||
    (!c.receiveOnly &&
      !(
        (txHz >= 144_000_000 && txHz <= 148_000_000) ||
        (txHz >= 430_000_000 && txHz <= 450_000_000)
      )) ||
    (c.receiveOnly && (row.offsetMHz !== 0 || row.toneMode !== "none"))
  )
    throw Error(
      "Receive or transmit frequency is outside the conservative amateur-band limits or the radio's 10 Hz step. Confirm your licence and local band plan.",
    );
  const block = Buffer.alloc(16);
  encodeBcdHz(rxHz).copy(block, 0);
  if (c.receiveOnly) block.fill(0xff, 4, 8);
  else encodeBcdHz(txHz).copy(block, 4);
  if (row.toneMode === "tone")
    block.writeUInt16LE(Math.round(Number(row.txTone) * 10), 10);
  block[14] = 1; // Low power; other signalling and extras remain off.
  block[15] = c.mode === "FM" ? 0x44 : 0x04; // FM width and scan on.
  const name = Buffer.alloc(16, 0xff);
  const label = String(c.callsign || "")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 7);
  if (!label)
    throw Error("Channel needs a callsign-derived radio memory name.");
  name.write(label, 0, "ascii");
  return {
    block,
    name,
    rxHz,
    txHz: c.receiveOnly ? null : txHz,
    label,
    tone: row.toneMode === "tone" ? row.txTone : null,
    mode: c.mode,
  };
}

function receiveOnlySlot() {
  // 146.520 MHz RX, transmit disabled (all FF), no tones, narrow FM, scan on.
  const block = Buffer.alloc(16);
  encodeBcdHz(146_520_000).copy(block, 0);
  block.fill(0xff, 4, 8);
  block[15] = 0x04;
  const name = Buffer.alloc(16, 0xff);
  name.write("OARTEST", 0, "ascii");
  return { block, name };
}

async function inspectLiveSlot(port) {
  await identify(port);
  await readBlock(port, 0x1e80, 0x40, true);
  const aux = await readBlock(port, 0x1ec0);
  if (
    aux
      .subarray(48, 62)
      .toString("latin1")
      .replace(/[\x00\xff]+$/g, "") !== FIRMWARE
  )
    throw Error("Firmware changed; refusing to write or restore a channel.");
  return {
    memory: await readBlock(port, SLOT_MAIN, 16),
    name: await readBlock(port, SLOT_NAME, 16),
  };
}

async function testAndRestoreSlot127(device, directory, portFactory) {
  if (!portFactory)
    throw Error(
      "Physical writes are disabled. This trial required a manual power cycle; no general safe write workflow is available.",
    );
  const freshPort = () =>
    portFactory ? portFactory(device) : new RadioPort(device);
  const expected = receiveOnlySlot();
  let original,
    backup,
    trialError,
    beganWrite = false;
  try {
    await withVerifiedBackup(
      device,
      directory,
      async ({ port, image, backup: saved }) => {
        if (!saved.empty127)
          throw Error("Slot 127 is no longer empty; no write was sent.");
        original = {
          memory: Buffer.from(
            image.subarray(8 + SLOT_MAIN, 8 + SLOT_MAIN + 16),
          ),
          name: Buffer.from(image.subarray(8 + SLOT_NAME, 8 + SLOT_NAME + 16)),
        };
        backup = saved; // Persisted and fsynced before either write command.
        if (
          !(await readBlock(port, SLOT_MAIN, 16)).equals(original.memory) ||
          !(await readBlock(port, SLOT_NAME, 16)).equals(original.name)
        )
          throw Error("Slot changed since backup; no write was sent.");
        beganWrite = true;
        await writeTestBlock(port, SLOT_MAIN, expected.block);
        await writeTestBlock(port, SLOT_NAME, expected.name);
      },
      portFactory,
    );
  } catch (error) {
    trialError = error;
  }
  if (!beganWrite) throw trialError; // No memory-write command was attempted.

  let trialVerified = false;
  const second = freshPort();
  try {
    const current = await inspectLiveSlot(second);
    if (
      ![original.memory, expected.block].some((item) =>
        current.memory.equals(item),
      ) ||
      ![original.name, expected.name].some((item) => current.name.equals(item))
    )
      throw Error(
        "Slot contents are neither original nor the test values; refusing restoration.",
      );
    trialVerified =
      !trialError &&
      current.memory.equals(expected.block) &&
      current.name.equals(expected.name);
    if (!current.memory.equals(original.memory))
      await writeTestBlock(second, SLOT_MAIN, original.memory);
    if (!current.name.equals(original.name))
      await writeTestBlock(second, SLOT_NAME, original.name);
  } catch (error) {
    throw Error(
      `Slot 127 may have changed: restoration could not be established (${error.message}). Stop using the radio until inspected. Backup: ${backup.filename}`,
    );
  } finally {
    second.close();
  }

  const third = freshPort();
  try {
    const restored = await inspectLiveSlot(third);
    if (
      !restored.memory.equals(original.memory) ||
      !restored.name.equals(original.name)
    )
      throw Error("Original slot contents did not persist.");
  } catch (error) {
    throw Error(
      `Slot 127 may not be restored (${error.message}). Stop using the radio until inspected. Backup: ${backup.filename}`,
    );
  } finally {
    third.close();
  }
  if (!trialVerified)
    throw Error(
      `Slot 127 was restored and independently verified, but the receive-only write test failed: ${trialError?.message || "test bytes were not confirmed"}`,
    );
  return { restored: true, slot: SLOT, receiveOnly: true, backup };
}

module.exports = {
  inspectImage,
  receiveOnlySlot,
  buildChannelBlocks,
  writeChannelBlock,
  withVerifiedBackup,
  testAndRestoreSlot127,
  saveBackup,
};
