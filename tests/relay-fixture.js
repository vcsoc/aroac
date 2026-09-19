import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
// Test substitute only: does not claim coverage of an operating-system vault.
export function testVault() {
  const key = randomBytes(32);
  return {
    encryptString(text) {
      const nonce = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, nonce);
      const bytes = Buffer.concat([
        cipher.update(text, "utf8"),
        cipher.final(),
      ]);
      return Buffer.concat([nonce, cipher.getAuthTag(), bytes]);
    },
    decryptString(value) {
      const cipher = createDecipheriv(
        "aes-256-gcm",
        key,
        value.subarray(0, 12),
      );
      cipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([
        cipher.update(value.subarray(28)),
        cipher.final(),
      ]).toString("utf8");
    },
  };
}
