import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import { iso1A2Code } from "@rapideditor/country-coder";
import {
  parseSources,
  selectSources,
  adapters,
  SOURCE_LIMIT,
  safeSourceUrl,
} from "../shared/sourceConfig.js";
import { normalizeMuf } from "./muf.js";
import { normalizeRepeaters } from "./repeaters.js";
import { validateContours } from "./mufContours.js";
const digest = (text) => createHash("sha256").update(text).digest("hex");
export const countryAt = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180
    ? iso1A2Code([lng, lat]) || ""
    : "";
export function privateAddress(ip) {
  if (ip.includes(":"))
    return /^(::|fe[89abcdef]|f[cd]|2001:db8)/i.test(ip) || ip.includes(".");
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0) ||
    (a === 198 && [18, 19, 51].includes(b)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}
export function publicFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: "GET",
        headers: options.headers,
        signal: options.signal || AbortSignal.timeout(15000),
        lookup(host, opts, callback) {
          lookup(host, { all: true }).then((addresses) => {
            if (
              !addresses.length ||
              addresses.some((a) => privateAddress(a.address))
            )
              return callback(
                Error("Source resolves to a private/reserved address."),
              );
            if (opts.all) callback(null, addresses);
            else {
              const a = addresses.find(
                (a) => !opts.family || a.family === opts.family,
              );
              a
                ? callback(null, a.address, a.family)
                : callback(Error("No public address for this family."));
            }
          }, callback);
        },
      },
      (res) =>
        resolve(
          new Response(Readable.toWeb(res), {
            status: res.statusCode,
            headers: Object.fromEntries(
              Object.entries(res.headers)
                .filter(([, v]) => v != null)
                .map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v]),
            ),
          }),
        ),
    );
    req.on("error", reject);
    req.end();
  });
}
export async function boundedText(response, limit) {
  if (!response.ok || !response.body) throw Error("Source is unavailable.");
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw Error("Source response is too large.");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString("utf8");
}
export function installSources(
  app,
  db,
  {
    sourcesPath,
    defaultSourcesPath = path.resolve("sources.yaml"),
    isOffline = () => false,
    fetcher = publicFetch,
  } = {},
) {
  const bundledText = readFileSync(defaultSourcesPath, "utf8"),
    defaults = parseSources(bundledText);
  db.exec(
    "CREATE TABLE IF NOT EXISTS source_configuration(id INTEGER PRIMARY KEY CHECK(id=1), text TEXT NOT NULL)",
  );
  const stored = db
    .prepare("SELECT text FROM source_configuration WHERE id=1")
    .get()?.text;
  let text = stored || bundledText,
    current;
  try {
    current = parseSources(text);
  } catch {
    text = bundledText;
    current = defaults;
  }
  let revision = digest(text),
    error = "",
    stamp = "",
    badText = "",
    listeners = [];
  let generation = 0;
  const invalidate = () => {
    generation++;
    for (const table of [
      "feed_cache",
      "weather_cache",
      "repeater_cache",
      "geocode_cache",
      "place_cache",
    ])
      try {
        db.exec(`UPDATE ${table} SET fetched=0`);
      } catch {}
    listeners.forEach((fn) => fn());
  };
  const accept = (next) => {
    const parsed = parseSources(next);
    const changed = digest(next) !== revision;
    current = parsed;
    text = next;
    revision = digest(next);
    error = "";
    badText = "";
    db.prepare("INSERT OR REPLACE INTO source_configuration VALUES(1,?)").run(
      text,
    );
    if (changed) invalidate();
  };
  const persist = (next) => {
    parseSources(next);
    if (sourcesPath) {
      mkdirSync(path.dirname(sourcesPath), { recursive: true, mode: 0o700 });
      const temp = sourcesPath + ".tmp";
      writeFileSync(temp, next, { mode: 0o600 });
      renameSync(temp, sourcesPath);
    }
    accept(next);
    stamp = "";
  };
  if (sourcesPath) {
    try {
      statSync(sourcesPath);
    } catch {
      persist(text);
    }
  }
  const refreshFile = () => {
    if (!sourcesPath) return;
    try {
      const s = statSync(sourcesPath),
        nextStamp = s.mtimeMs + ":" + s.size;
      if (stamp === nextStamp) return;
      stamp = nextStamp;
      if (s.size > SOURCE_LIMIT)
        throw Error("Source configuration exceeds 128 KiB.");
      const next = readFileSync(sourcesPath, "utf8");
      badText = next;
      accept(next);
    } catch (e) {
      error =
        "Source configuration changes are causing configuration exceptions: " +
        e.message +
        " OAR is using the last valid configuration.";
    }
  };
  const homeCountry = () => {
    try {
      const home = JSON.parse(
        db
          .prepare(
            "SELECT value FROM workspace_preferences WHERE key='world-time'",
          )
          .get()?.value || "{}",
      ).home;
      return countryAt(home?.lat, home?.lng);
    } catch {
      return "";
    }
  };
  let previousCountry = null;
  const refresh = () => {
    refreshFile();
    const country = homeCountry();
    if (previousCountry !== null && country !== previousCountry) invalidate();
    previousCountry = country;
  };
  const resolve = (kind, country = homeCountry()) => {
    refresh();
    return selectSources(current, kind, country);
  };
  const view = () => {
    refresh();
    const country = homeCountry();
    return {
      text: badText || text,
      error,
      revision,
      path: sourcesPath || "Local database",
      country,
      active: Object.fromEntries(
        Object.keys(adapters).map((kind) => [kind, resolve(kind, country)[0]]),
      ),
    };
  };
  app.get("/api/sources", (_req, res) => res.json(view()));
  app.get("/api/country", (req, res) =>
    res.json({
      countryCode: countryAt(Number(req.query.lat), Number(req.query.lng)),
    }),
  );
  app.put("/api/sources", (req, res) => {
    try {
      persist(req.body.text);
      res.json(view());
    } catch (e) {
      res.status(400).json({
        error:
          "Configuration changes cause exceptions: " +
          e.message +
          " The active configuration was not changed.",
      });
    }
  });
  app.post("/api/sources/reset", async (_req, res) => {
    let restored = bundledText,
      origin = "bundled defaults (GitHub unavailable or incompatible)";
    if (!isOffline())
      try {
        restored = await boundedText(
          await fetcher(
            "https://raw.githubusercontent.com/vcsoc/oar/main/sources.yaml",
            { signal: AbortSignal.timeout(10000) },
          ),
          SOURCE_LIMIT,
        );
        parseSources(restored);
        origin = "GitHub defaults";
      } catch {
        restored = bundledText;
      }
    try {
      persist(restored);
      res.json({ ...view(), restoredFrom: origin });
    } catch (e) {
      res
        .status(500)
        .json({ error: "Could not reset source configuration: " + e.message });
    }
  });
  const routedFetch = async (input, init = {}) => {
    if (isOffline()) throw Error("Offline mode is enabled.");
    refresh();
    const original = new URL(input),
      route = defaults.sources.find((s) => {
        const u = new URL(s.url);
        return (
          u.origin === original.origin &&
          u.pathname.replace(/\/$/, "") === original.pathname.replace(/\/$/, "")
        );
      });
    if (!route) return fetcher(input, init);
    const lat = Number(
        original.searchParams.get("latitude") ??
          original.searchParams.get("lat") ??
          NaN,
      ),
      lng = Number(
        original.searchParams.get("longitude") ??
          original.searchParams.get("lon") ??
          NaN,
      );
    const candidates = resolve(
      route.kind,
      countryAt(lat, lng) || homeCountry(),
    );
    let last;
    const started = generation;
    for (const source of candidates) {
      try {
        const url = new URL(source.url);
        for (const [key, val] of original.searchParams)
          url.searchParams.set(key, val);
        const response = await fetcher(url, {
          ...init,
          signal: init.signal || AbortSignal.timeout(15000),
        });
        const body = await boundedText(
          response,
          route.kind === "repeaters" ? 32 * 1024 * 1024 : 4 * 1024 * 1024,
        );
        const data = JSON.parse(body);
        const valid =
          route.kind === "weather"
            ? data.current && Array.isArray(data.daily?.time)
            : ["muf", "repeaters", "kp", "solar"].includes(route.kind)
              ? Array.isArray(data) && data.length
              : route.kind === "mufContours"
                ? data.type === "FeatureCollection"
                : route.kind === "iss"
                  ? Number.isFinite(data.latitude) &&
                    Number.isFinite(data.longitude)
                  : route.kind === "radar"
                    ? Array.isArray(data.radar?.past)
                    : Array.isArray(data.features);
        if (!valid)
          throw Error(
            "The configured endpoint does not match the " +
              source.adapter +
              " adapter.",
          );
        if (
          (route.kind === "muf" && !normalizeMuf(data).length) ||
          (route.kind === "repeaters" && !normalizeRepeaters(data).length)
        )
          throw Error("No valid observations from this source.");
        if (route.kind === "mufContours") validateContours(data);
        if (route.kind === "radar") safeSourceUrl(data.host);
        refresh();
        if (started !== generation)
          throw Error("Source configuration changed during download; retry.");
        const result = new Response(body, {
          headers: {
            "content-type": "application/json",
            ...(response.headers.get("last-modified")
              ? { "last-modified": response.headers.get("last-modified") }
              : {}),
          },
        });
        result.oarSource = source;
        return result;
      } catch (e) {
        if (started !== generation)
          throw Error("Source configuration changed during download; retry.");
        last = e;
      }
    }
    throw last || Error("No compatible source is available.");
  };
  return {
    fetch: routedFetch,
    resolve,
    refresh,
    view,
    onChange: (fn) => listeners.push(fn),
  };
}
