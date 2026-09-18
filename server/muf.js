export const MUF_SOURCE = "https://prop.kc2g.com/api/stations.json";
const num = (v) =>
  (typeof v === "number" || typeof v === "string") &&
  String(v).trim() !== "" &&
  Number.isFinite(Number(v))
    ? Number(v)
    : null;
export function normalizeMuf(rows) {
  if (!Array.isArray(rows) || rows.length > 5000)
    throw Error("Invalid MUF observations");
  const unique = new Map();
  for (const row of rows) {
    const s = row?.station;
    const lat = num(s?.latitude),
      lon = num(s?.longitude),
      mhz = num(row?.mufd);
    const raw = row?.time;
    if (
      !s ||
      !Number.isFinite(lat) ||
      Math.abs(lat) > 90 ||
      !Number.isFinite(lon) ||
      lon < -180 ||
      lon > 360 ||
      !Number.isFinite(mhz) ||
      mhz <= 0 ||
      mhz > 200 ||
      typeof raw !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(raw)
    )
      continue;
    const time = Date.parse(
      /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : raw + "Z",
    );
    if (!Number.isFinite(time)) continue;
    const code = String(s.code || "").slice(0, 24);
    if (!code) continue;
    const confidence = num(row.cs);
    const point = {
      code,
      name: String(s.name || code).slice(0, 160),
      lat,
      lng: ((((lon + 180) % 360) + 360) % 360) - 180,
      mhz,
      observedAt: new Date(time).toISOString(),
      confidence:
        confidence !== null && confidence >= 0 && confidence <= 100
          ? confidence
          : null,
    };
    if (!unique.has(code) || unique.get(code).observedAt < point.observedAt)
      unique.set(code, point);
  }
  return [...unique.values()];
}
export function mufView(
  value,
  { now = Date.now(), stale = false, offline = false } = {},
) {
  const stations = value.observations
    .filter((p) => {
      const age = now - Date.parse(p.observedAt);
      return age >= -600000 && age <= 86400000;
    })
    .map((p) => ({ ...p, old: now - Date.parse(p.observedAt) > 90 * 60000 }));
  return {
    ...value,
    observations: undefined,
    stations,
    omitted: value.observations.length - stations.length,
    stale,
    offline,
  };
}
export function installMuf(app, db, { isOffline = () => false } = {}) {
  let pending;
  const saved = () => {
    const row = db
      .prepare("SELECT value,fetched FROM feed_cache WHERE name='muf'")
      .get();
    if (!row) return null;
    try {
      return { value: JSON.parse(row.value), fetched: row.fetched };
    } catch {
      return null;
    }
  };
  const download = async () => {
    const response = await fetch(MUF_SOURCE, {
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw Error("MUF provider unavailable");
    const reader = response.body.getReader();
    let size = 0;
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2 * 1024 * 1024) {
        await reader.cancel();
        throw Error("MUF response too large");
      }
      chunks.push(value);
    }
    const observations = normalizeMuf(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    if (!observations.length) throw Error("No valid MUF observations received");
    const value = {
      observations,
      source: MUF_SOURCE,
      fetchedAt: new Date().toISOString(),
    };
    db.prepare(
      "INSERT INTO feed_cache(name,value,fetched) VALUES('muf',?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value,fetched=excluded.fetched",
    ).run(JSON.stringify(value), Date.now());
    return value;
  };
  app.get("/api/muf", async (req, res) => {
    const cached = saved();
    if (isOffline()) {
      if (cached)
        return res.json(mufView(cached.value, { stale: true, offline: true }));
      return res.status(503).json({
        error:
          "Offline: no saved MUF observations. Connect once with the MUF layer enabled.",
      });
    }
    if (cached && Date.now() - cached.fetched < 300000)
      return res.json(mufView(cached.value));
    try {
      if (!pending)
        pending = download().finally(() => {
          pending = null;
        });
      res.json(
        mufView(await pending, { stale: isOffline(), offline: isOffline() }),
      );
    } catch {
      if (cached) return res.json(mufView(cached.value, { stale: true }));
      res.status(502).json({
        error:
          "MUF observations unavailable from KC2G/GIRO. No propagation values are being guessed.",
      });
    }
  });
}
