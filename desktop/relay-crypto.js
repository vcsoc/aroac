import sodium from "libsodium-wrappers";
import { createHash, randomUUID } from "node:crypto";
export const ready = sodium.ready;
ready.catch(() => {}); // Optional transport failure must not crash the offline workspace.
export const hash = (bytes) =>
  createHash("sha256").update(bytes).digest("base64url");
export function decode(value, length) {
  if (
    typeof value !== "string" ||
    !value.length ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    throw Error("Invalid encoded key or ciphertext.");
  const bytes = Buffer.from(value, "base64url");
  if (
    bytes.toString("base64url") !== value ||
    (length !== undefined && bytes.length !== length)
  )
    throw Error("Invalid key or signature length.");
  return bytes;
}
const encode = (value) => Buffer.from(value).toString("base64url");
const utf8 = (value) => Buffer.from(JSON.stringify(value));
const keyStatement = (id, x) => utf8(["OAR-DEVICE-KEY-V1", id, x]);
export function createIdentity() {
  const signing = sodium.crypto_sign_keypair(),
    encryption = sodium.crypto_box_keypair();
  const deviceId = hash(signing.publicKey),
    x = encode(encryption.publicKey);
  return {
    deviceId,
    signingKey: encode(signing.publicKey),
    encryptionKey: { kty: "OKP", crv: "X25519", x },
    keySignature: encode(
      sodium.crypto_sign_detached(
        keyStatement(deviceId, x),
        signing.privateKey,
      ),
    ),
    signingSecret: encode(signing.privateKey),
    encryptionSecret: encode(encryption.privateKey),
  };
}
export function publicIdentity(identity) {
  const { deviceId, signingKey, encryptionKey, keySignature } = identity;
  return { deviceId, signingKey, encryptionKey, keySignature };
}
export function validatePeer(peer, expectedId) {
  if (
    !peer ||
    peer.deviceId !== expectedId ||
    hash(decode(peer.signingKey, 32)) !== expectedId ||
    peer.encryptionKey?.kty !== "OKP" ||
    peer.encryptionKey?.crv !== "X25519"
  )
    throw Error("Peer identity does not match the requested device.");
  decode(peer.encryptionKey.x, 32);
  if (
    !sodium.crypto_sign_verify_detached(
      decode(peer.keySignature, 64),
      keyStatement(expectedId, peer.encryptionKey.x),
      decode(peer.signingKey, 32),
    )
  )
    throw Error("Peer encryption key is not signed by this device.");
  return publicIdentity(peer);
}
export function signedHeaders(
  identity,
  origin,
  method,
  route,
  body = "",
  now = Date.now(),
) {
  const timestamp = String(Math.floor(now / 1000)),
    nonce = encode(sodium.randombytes_buf(24));
  const statement = [
    "OAR-REQUEST-V1",
    new URL(origin).origin,
    timestamp,
    nonce,
    method,
    route,
    hash(Buffer.from(body)),
  ].join("\n");
  return {
    "X-Oar-Device": identity.deviceId,
    "X-Oar-Timestamp": timestamp,
    "X-Oar-Nonce": nonce,
    "X-Oar-Signature": encode(
      sodium.crypto_sign_detached(
        Buffer.from(statement),
        decode(identity.signingSecret, 64),
      ),
    ),
  };
}
const envelopeStatement = (e) =>
  utf8([
    "OAR-MESSAGE-V1",
    e.id,
    e.senderId,
    e.recipientId,
    e.recipientKey,
    e.createdAt,
    e.expiresAt,
    e.ciphertext,
  ]);
export function sealMessage(identity, peer, text, now = Date.now()) {
  validatePeer(peer, peer.deviceId);
  if (
    typeof text !== "string" ||
    !text.trim() ||
    Buffer.byteLength(text) > 8192
  )
    throw Error("Messages must contain 1–8192 UTF-8 bytes.");
  const plaintext = utf8({ text });
  if (plaintext.length > 17000)
    throw Error("Message is too large after JSON encoding.");
  let ciphertext;
  try {
    ciphertext = encode(
      sodium.crypto_box_seal(plaintext, decode(peer.encryptionKey.x, 32)),
    );
  } finally {
    sodium.memzero(plaintext);
  }
  const envelope = {
    version: 1,
    id: randomUUID(),
    senderId: identity.deviceId,
    recipientId: peer.deviceId,
    recipientKey: hash(decode(peer.encryptionKey.x, 32)),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 7 * 86400000 - 120000).toISOString(),
    ciphertext,
  };
  return {
    ...envelope,
    signature: encode(
      sodium.crypto_sign_detached(
        envelopeStatement(envelope),
        decode(identity.signingSecret, 64),
      ),
    ),
  };
}
export function openMessage(identity, peer, envelope, now = Date.now()) {
  validatePeer(peer, peer.deviceId);
  const e = envelope,
    fields = [
      "version",
      "id",
      "senderId",
      "recipientId",
      "recipientKey",
      "createdAt",
      "expiresAt",
      "ciphertext",
      "signature",
    ];
  if (
    !e ||
    Object.keys(e).length !== fields.length ||
    Object.keys(e).some((k) => !fields.includes(k)) ||
    e.version !== 1 ||
    !/^([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i.test(
      e.id,
    ) ||
    e.senderId !== peer.deviceId ||
    e.recipientId !== identity.deviceId ||
    e.recipientKey !== hash(decode(identity.encryptionKey.x, 32)) ||
    typeof e.ciphertext !== "string" ||
    e.ciphertext.length > 24000
  )
    throw Error("Invalid message binding.");
  const created = Date.parse(e.createdAt),
    expires = Date.parse(e.expiresAt);
  if (
    !Number.isFinite(created) ||
    !Number.isFinite(expires) ||
    created > now + 90000 ||
    expires <= now ||
    expires <= created ||
    expires - created > 7 * 86400000
  )
    throw Error("Expired or invalid message timestamp.");
  if (
    !sodium.crypto_sign_verify_detached(
      decode(e.signature, 64),
      envelopeStatement(e),
      decode(peer.signingKey, 32),
    )
  )
    throw Error("Invalid sender signature.");
  let clear;
  try {
    clear = sodium.crypto_box_seal_open(
      decode(e.ciphertext),
      decode(identity.encryptionKey.x, 32),
      decode(identity.encryptionSecret, 32),
    );
    const value = JSON.parse(Buffer.from(clear).toString("utf8"));
    if (
      !value ||
      Object.keys(value).length !== 1 ||
      typeof value.text !== "string" ||
      !value.text.trim() ||
      Buffer.byteLength(value.text) > 8192
    )
      throw Error();
    return value.text;
  } catch {
    throw Error("Invalid encrypted message.");
  } finally {
    if (clear) sodium.memzero(clear);
  }
}
