// Profiles combine an operator-supplied physical label/serial with a non-unique
// protocol/calibration signature. Never infer a unique handset from USB ID.
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID, randomBytes } = require("node:crypto");
const { inspectImage } = require("./uv5r.cjs");
function readStore(root) {
  try {
    const file = path.join(root, "radio-profiles.json");
    if (fs.lstatSync(file).isSymbolicLink())
      throw Error("Unsafe radio profile store.");
    const store = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(store)) throw Error("Invalid radio profile store.");
    return store;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
function writeStore(root, store) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const temp = path.join(
    root,
    `.radio-profiles-${randomBytes(8).toString("hex")}`,
  );
  const fd = fs.openSync(temp, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(store, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, path.join(root, "radio-profiles.json"));
}
function profiles(root, owner) {
  const own = readStore(root).filter((radio) => radio.owner === owner);
  return own.map((radio) => ({
    ...radio,
    matchingSignatureProfiles: own.filter(
      (other) =>
        other.id !== radio.id && other.fingerprint === radio.fingerprint,
    ).length,
  }));
}
function getProfile(root, owner, id) {
  if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id))
    throw Error("Select a registered physical radio.");
  const radio = profiles(root, owner).find((entry) => entry.id === id);
  if (!radio) throw Error("Radio profile not found for this local user.");
  return radio;
}
function backupDirectory(root, owner, id) {
  const radio = getProfile(root, owner, id);
  return path.join(root, "radio-backups", `profile-${owner}`, radio.id);
}
function enroll(root, owner, input, image) {
  if (!Number.isSafeInteger(owner))
    throw Error("Sign in before registering a radio.");
  const label = typeof input?.label === "string" ? input.label.trim() : "";
  const serial = typeof input?.serial === "string" ? input.serial.trim() : "";
  if (
    !label ||
    label.length > 80 ||
    !serial ||
    serial.length > 80 ||
    /[\x00-\x1f\x7f]/.test(label + serial)
  )
    throw Error(
      "Enter a radio name and its physical serial/unique label (1–80 characters each).",
    );
  if (input.confirmPhysical !== true)
    throw Error(
      "Confirm the physical radio label; the fingerprint alone is not unique.",
    );
  const signature = inspectImage(image);
  const store = readStore(root);
  if (store.filter((radio) => radio.owner === owner).length >= 32)
    throw Error("At most 32 radios per local profile.");
  if (
    store.some(
      (radio) =>
        radio.owner === owner &&
        radio.serial.toLowerCase() === serial.toLowerCase(),
    )
  )
    throw Error(
      "That physical serial/label already has a radio profile. Select it instead.",
    );
  const radio = {
    id: randomUUID(),
    owner,
    label,
    serial,
    model: "UV-5R",
    firmware: signature.version,
    fingerprint: signature.fingerprint,
    fingerprintVersion: signature.fingerprintVersion,
    identityWarning:
      "Calibration signature is not a guaranteed unique serial number; confirm the physical label before each operation.",
    created: new Date().toISOString(),
  };
  store.push(radio);
  writeStore(root, store);
  return getProfile(root, owner, radio.id);
}
function history(root, owner, id) {
  const radio = getProfile(root, owner, id);
  const dir = backupDirectory(root, owner, id);
  let files;
  try {
    files = fs
      .readdirSync(dir)
      .filter((name) => /^uv5r-readonly-[A-Za-z0-9-]+\.img$/.test(name));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return files
    .map((name) => {
      const filename = path.join(dir, name);
      if (fs.lstatSync(filename).isSymbolicLink())
        throw Error("Unsafe backup link.");
      const data = fs.readFileSync(filename),
        info = inspectImage(data);
      if (info.fingerprint !== radio.fingerprint)
        throw Error("Backup fingerprint mismatch in this radio's history.");
      return {
        filename,
        sha256: info.sha256,
        fingerprint: info.fingerprint,
        bytes: data.length,
        created: fs.statSync(filename).mtime.toISOString(),
      };
    })
    .sort((a, b) => b.created.localeCompare(a.created));
}
module.exports = { profiles, getProfile, enroll, history, backupDirectory };
