import { isNative, nativeRequest, exportNative } from "./platform.js";
let sessionEpoch = 0;
export const invalidateSessionRequests = () => {
  sessionEpoch++;
};
export async function api(path, options = {}) {
  const epoch = sessionEpoch;
  const value = await request(path, options);
  if (epoch !== sessionEpoch)
    throw Error("Session changed; the old response was discarded.");
  return value;
}
async function request(path, options = {}) {
  if (isNative) return nativeRequest(path, options);
  const res = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await res.json().catch(() => ({ error: "Service unavailable" }));
  if (!res.ok)
    throw Object.assign(new Error(data.error || "Request failed"), {
      fields: data.fields || {},
    });
  return data;
}
export const post = (path, body) =>
  api(path, { method: "POST", body: JSON.stringify(body) });
export function gridCenter(grid = "JJ00") {
  const g = grid.toUpperCase();
  return {
    lng:
      (g.charCodeAt(0) - 65) * 20 +
      Number(g[2]) * 2 -
      180 +
      (g.length === 6 ? (g.charCodeAt(4) - 65) / 12 + 1 / 24 : 1),
    lat:
      (g.charCodeAt(1) - 65) * 10 +
      Number(g[3]) -
      90 +
      (g.length === 6 ? (g.charCodeAt(5) - 65) / 24 + 1 / 48 : 0.5),
  };
}
export function maidenhead(lat, lng) {
  const x = Math.min(359.99999, Math.max(0, lng + 180)),
    y = Math.min(179.99999, Math.max(0, lat + 90));
  return (
    String.fromCharCode(65 + Math.floor(x / 20), 65 + Math.floor(y / 10)) +
    Math.floor((x % 20) / 2) +
    Math.floor(y % 10) +
    String.fromCharCode(
      97 + Math.floor((x % 2) * 12),
      97 + Math.floor((y % 1) * 24),
    )
  );
}
export const timeAt = (date, zone = "UTC") =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
export function adif(rows) {
  const tag = (name, value) => `<${name}:${String(value).length}>${value}`;
  return (
    "OAR ADIF export\n<ADIF_VER:5>3.1.4<EOH>\n" +
    rows
      .map((r) => {
        const d = new Date(r.created).toISOString();
        return (
          tag("CALL", r.callsign) +
          tag("QSO_DATE", d.slice(0, 10).replaceAll("-", "")) +
          tag("TIME_ON", d.slice(11, 19).replaceAll(":", "")) +
          tag("FREQ", r.frequency) +
          tag("MODE", r.mode) +
          "<EOR>"
        );
      })
      .join("\n")
  );
}
export async function download(name, text) {
  if (isNative) return exportNative(name, text);
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
