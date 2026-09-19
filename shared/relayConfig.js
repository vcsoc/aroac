import { parseDocument } from "yaml";
export function parseRelaySettings(text, { allowLoopback = false } = {}) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 8192)
    throw Error("Settings YAML must be at most 8 KiB.");
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length) throw Error("Invalid settings YAML.");
  const value = document.toJS({ maxAliasCount: 0 });
  const exact = (v, keys) =>
    v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.keys(v).every((k) => keys.includes(k));
  if (
    !exact(value, ["version", "relay"]) ||
    value.version !== 1 ||
    !exact(value.relay, ["url", "enrollmentToken"])
  )
    throw Error("Expected version: 1 and relay settings only.");
  const { url, enrollmentToken } = value.relay;
  if (typeof url !== "string" || url.length > 2048)
    throw Error("Invalid relay URL.");
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw Error("Invalid relay URL.");
  }
  const development =
    allowLoopback &&
    parsed.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (
    (parsed.protocol !== "https:" && !development) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  )
    throw Error(
      "Relay must be an HTTPS origin without credentials, path, query or fragment.",
    );
  if (
    enrollmentToken !== undefined &&
    (typeof enrollmentToken !== "string" ||
      enrollmentToken.length < 16 ||
      enrollmentToken.length > 2048 ||
      /[\s\x00-\x1f\x7f]/.test(enrollmentToken))
  )
    throw Error("Invalid enrollment token.");
  return {
    version: 1,
    relay: {
      url: parsed.origin,
      ...(enrollmentToken ? { enrollmentToken } : {}),
    },
  };
}
