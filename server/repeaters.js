const SOURCE = "https://hearham.com/api/repeaters/v1";
const DAY = 86400000;
export function normalizeRepeaters(rows) {
  if (!Array.isArray(rows) || rows.length > 100000)
    throw Error("Unexpected repeater directory");
  return rows.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const lat = Number(raw.latitude),
      lng = Number(raw.longitude),
      frequency = Number(raw.frequency);
    if (
      raw.latitude == null ||
      raw.longitude == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180 ||
      (lat === 0 && lng === 0) ||
      !Number.isFinite(frequency) ||
      frequency <= 0
    )
      return [];
    return [
      {
        id: `hearham-${raw.id ?? index}`,
        lat,
        lng,
        callsign: String(raw.callsign || ""),
        city: String(raw.city || ""),
        mode: String(raw.mode || ""),
        frequencyMHz: frequency / 1e6,
        offsetMHz:
          raw.offset !== null &&
          raw.offset !== undefined &&
          raw.offset !== "" &&
          Number.isFinite(Number(raw.offset))
            ? Number(raw.offset) / 1e6
            : null,
        raw,
      },
    ];
  });
}
export function installRepeaters(
  app,
  db,
  { isOffline = () => false, fetcher = fetch } = {},
) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS repeater_cache(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL,fetched INTEGER NOT NULL)",
  );
  let inFlight;
  async function download() {
    const response = await fetcher(SOURCE, {
      headers: {
        "User-Agent": "OAR/0.3 (standalone amateur radio application)",
      },
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) throw Error("Repeater directory unavailable");
    if (Number(response.headers?.get("content-length") || 0) > 32 * 1024 * 1024)
      throw Error("Directory too large");
    const reader = response.body?.getReader();
    let rows;
    if (reader) {
      let size = 0;
      const chunks = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 32 * 1024 * 1024) throw Error("Directory too large");
          chunks.push(Buffer.from(value));
        }
        rows = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch (error) {
        await reader.cancel();
        throw error;
      } finally {
        reader.releaseLock();
      }
    } else rows = await response.json();
    const repeaters = normalizeRepeaters(rows);
    if (!repeaters.length) throw Error("Directory has no geolocated repeaters");
    const fetched = Date.now(),
      value = {
        repeaters,
        source: response.oarSource?.attribution || "hearham.com",
        sourceUrl: response.oarSource?.url || SOURCE,
        fetchedAt: new Date(fetched).toISOString(),
        providerCount: rows.length,
        omitted: rows.length - repeaters.length,
      };
    db.prepare(
      "INSERT INTO repeater_cache VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,fetched=excluded.fetched",
    ).run(JSON.stringify(value), fetched);
    return value;
  }
  app.get("/api/repeaters", async (req, res) => {
    const saved = db
      .prepare("SELECT payload,fetched FROM repeater_cache WHERE id=1")
      .get();
    let cached;
    try {
      if (saved) cached = JSON.parse(saved.payload);
    } catch {}
    if (isOffline())
      return cached
        ? res.json({ ...cached, cached: true, offline: true, stale: true })
        : res.status(503).json({
            error:
              "No repeater directory is saved yet. Go online once to download it; it will then be available offline.",
          });
    if (
      cached &&
      Date.now() - saved.fetched < (req.query.refresh === "1" ? 60000 : DAY)
    )
      return res.json({ ...cached, cached: true });
    try {
      if (!inFlight)
        inFlight = download().finally(() => {
          inFlight = null;
        });
      res.json(await inFlight);
    } catch {
      if (cached) return res.json({ ...cached, cached: true, stale: true });
      res.status(502).json({
        error:
          "Repeater directory unavailable. No repeater positions have been invented. Please try again later.",
      });
    }
  });
}
