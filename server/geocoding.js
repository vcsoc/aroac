import { ownerId, visible } from "./privacy.js";
export function addressResults(payload) {
  return (payload.features || []).slice(0, 6).flatMap((feature, index) => {
    const [lng, lat] = feature.geometry?.coordinates || [];
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    )
      return [];
    const p = feature.properties || {};
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const title = p.name || street || p.city || p.country || "Mapped location";
    const subtitle = [
      street !== title ? street : null,
      p.city,
      p.state,
      p.postcode,
      p.country,
    ]
      .filter((v, i, a) => v && a.indexOf(v) === i)
      .join(", ");
    return [
      {
        id: `${p.osm_type || "place"}-${p.osm_id || index}`,
        title,
        subtitle,
        lat,
        lng,
        zoom: p.housenumber ? 17 : p.street ? 15 : p.city ? 11 : 7,
      },
    ];
  });
}
export function installGeocoding(
  app,
  db,
  { isOffline = () => false, fetcher = fetch } = {},
) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS geocode_cache(query TEXT PRIMARY KEY,results TEXT NOT NULL,fetched INTEGER NOT NULL)",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS geocode_corrections(query TEXT PRIMARY KEY, payload TEXT NOT NULL, pin_id INTEGER)",
  );
  db.exec(
    `CREATE TABLE IF NOT EXISTS scoped_geocode_corrections(query TEXT NOT NULL,owner INTEGER NOT NULL,payload TEXT NOT NULL,pin_id INTEGER,PRIMARY KEY(query,owner))`,
  );
  if (
    db
      .prepare("PRAGMA table_info(pins)")
      .all()
      .some((c) => c.name === "owner")
  )
    db.exec(
      `INSERT OR IGNORE INTO scoped_geocode_corrections SELECT query,COALESCE(p.owner,0),payload,pin_id FROM geocode_corrections g JOIN pins p ON p.id=g.pin_id; DELETE FROM geocode_corrections;`,
    );
  const corrected = (key, results, req) => {
    const saved = db
      .prepare(
        "SELECT * FROM scoped_geocode_corrections WHERE query=? AND owner IN (0,?) ORDER BY owner DESC LIMIT 1",
      )
      .get(key, ownerId(req) ?? 0);
    if (!saved) return results;
    const value = JSON.parse(saved.payload),
      pin = db
        .prepare(`SELECT lat,lng FROM pins WHERE id=? AND ${visible}`)
        .get(saved.pin_id, ownerId(req));
    if (!pin) return results;
    const location = { ...value, ...(pin || {}), corrected: true };
    return [location, ...results.filter((r) => r.id !== location.id)];
  };
  app.post("/api/geocode/correction", (req, res) => {
    const query =
      typeof req.body?.query === "string" ? req.body.query.trim() : "";
    if (
      query.length < 3 ||
      query.length > 200 ||
      !Number.isSafeInteger(req.body?.pinId)
    )
      return res
        .status(400)
        .json({ error: "Choose an address result and a saved pin." });
    const pin = db
      .prepare(`SELECT * FROM pins WHERE id=? AND ${visible}`)
      .get(req.body.pinId, ownerId(req));
    if (!pin) return res.status(404).json({ error: "Saved pin not found." });
    const key = query.toLowerCase(),
      cached = db
        .prepare("SELECT results FROM geocode_cache WHERE query=?")
        .get(key);
    const result = cached
      ? JSON.parse(cached.results).find((r) => r.id === req.body.resultId)
      : null;
    if (!result)
      return res.status(400).json({
        error: "Search for the address again before correcting its position.",
      });
    const value = {
      ...result,
      providerLat: result.lat,
      providerLng: result.lng,
      lat: pin.lat,
      lng: pin.lng,
      corrected: true,
    };
    db.prepare(
      "INSERT OR REPLACE INTO scoped_geocode_corrections VALUES(?,?,?,?)",
    ).run(key, ownerId(req) ?? 0, JSON.stringify(value), pin.id);
    res.json({ ...value, searchQuery: query });
  });
  app.delete("/api/geocode/correction", (req, res) => {
    const query =
      typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    db.prepare(
      "DELETE FROM scoped_geocode_corrections WHERE query=? AND owner=?",
    ).run(query, ownerId(req) ?? 0);
    res.json({ ok: true });
  });
  app.get("/api/geocode", async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (query.length < 3 || query.length > 200)
      return res.status(400).json({
        error: "Enter an address or place name between 3 and 200 characters.",
      });
    const key = query.toLowerCase(),
      saved = db
        .prepare("SELECT results,fetched FROM geocode_cache WHERE query=?")
        .get(key);
    let cached;
    try {
      if (saved) cached = JSON.parse(saved.results);
    } catch {}
    const source = "Photon / OpenStreetMap";
    if (cached && (isOffline() || Date.now() - saved.fetched < 7 * 86400000))
      return res.json({
        results: corrected(key, cached, req),
        source,
        cached: true,
        offline: isOffline(),
      });
    if (isOffline())
      return res.status(503).json({
        error:
          "This address is not cached. Go online to search addresses, or enter latitude, longitude offline.",
      });
    try {
      const url = new URL("https://photon.komoot.io/api/");
      url.search = new URLSearchParams({
        q: query,
        limit: "6",
        lang: "en",
      }).toString();
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw Error("Address provider unavailable");
      const results = addressResults(await response.json()).map((result) => ({
        ...result,
        locationSource: response.oarSource?.attribution || source,
      }));
      db.prepare(
        "INSERT INTO geocode_cache VALUES(?,?,?) ON CONFLICT(query) DO UPDATE SET results=excluded.results,fetched=excluded.fetched",
      ).run(key, JSON.stringify(results), Date.now());
      res.json({
        results: corrected(key, results, req),
        source: response.oarSource?.attribution || source,
      });
    } catch {
      if (cached)
        return res.json({
          results: corrected(key, cached, req),
          source,
          cached: true,
          stale: true,
        });
      res.status(502).json({
        error:
          "Address lookup is unavailable. Try again, or enter latitude, longitude.",
      });
    }
  });
}
