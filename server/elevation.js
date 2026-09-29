// On-demand DEM samples for link planning; these are estimates, never a surveyed path.
import { linkGeometry } from "../src/contactContext.js";

export function samplePath(source, destination, count = 33) {
  const rad = Math.PI / 180;
  const xyz = (p) => [Math.cos(p.lat * rad) * Math.cos(p.lng * rad), Math.cos(p.lat * rad) * Math.sin(p.lng * rad), Math.sin(p.lat * rad)];
  const a = xyz(source), b = xyz(destination);
  const dot = Math.max(-1, Math.min(1, a.reduce((sum, v, i) => sum + v * b[i], 0)));
  const angle = Math.acos(dot);
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    if (angle < 1e-8 || Math.abs(Math.sin(angle)) < 1e-8)
      return { lat: source.lat + (destination.lat - source.lat) * t, lng: source.lng + (destination.lng - source.lng) * t };
    const x = Math.sin((1 - t) * angle) / Math.sin(angle), y = Math.sin(t * angle) / Math.sin(angle);
    const v = a.map((n, j) => n * x + b[j] * y);
    return { lat: Math.atan2(v[2], Math.hypot(v[0], v[1])) / rad, lng: Math.atan2(v[1], v[0]) / rad };
  });
}

export function estimateClearance(elevations, distanceKm, sourceHeight, destinationHeight) {
  if (!Array.isArray(elevations) || elevations.length < 3 || elevations.some((n) => !Number.isFinite(n)) || ![distanceKm, sourceHeight, destinationHeight].every((n) => Number.isFinite(n) && n >= 0)) return null;
  const start = elevations[0] + sourceHeight, end = elevations.at(-1) + destinationHeight;
  let lowest = Infinity;
  for (let i = 1; i < elevations.length - 1; i++) {
    const t = i / (elevations.length - 1);
    // 4/3 effective Earth radius: standard-atmosphere refraction only.
    const curvature = (distanceKm * 1000) ** 2 * t * (1 - t) / (2 * (6371000 * 4 / 3));
    lowest = Math.min(lowest, start * (1 - t) + end * t - curvature - elevations[i]);
  }
  return lowest;
}

export function installElevation(app, db, { isOffline = () => false, fetcher = fetch } = {}) {
  db.exec("CREATE TABLE IF NOT EXISTS elevation_cache (key TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched INTEGER NOT NULL)");
  const pending = new Map();
  app.get("/api/elevation-profile", async (req, res) => {
    const keys = ["lat1", "lng1", "lat2", "lng2"];
    if (keys.some((key) => typeof req.query[key] !== "string" || !req.query[key].trim()))
      return res.status(400).json({ error: "Both endpoint coordinates are required." });
    const [lat1, lng1, lat2, lng2] = keys.map((key) => Number(req.query[key]));
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite) || Math.abs(lat1) > 90 || Math.abs(lat2) > 90 || Math.abs(lng1) > 180 || Math.abs(lng2) > 180)
      return res.status(400).json({ error: "Invalid endpoint coordinates." });
    const source = { lat: lat1, lng: lng1 }, destination = { lat: lat2, lng: lng2 };
    const distanceKm = linkGeometry(source, destination).distance;
    if (distanceKm < 0.05)
      return res.status(400).json({ error: "DEM profile requires distinct points at least 50 m apart." });
    // Long paths still receive endpoint heights; sampling 33 points across
    // thousands of kilometres would falsely suggest terrain was surveyed.
    const endpointsOnly = distanceKm > 500;
    const key = [lat1, lng1, lat2, lng2].map((n) => n.toFixed(5)).join(",");
    const cached = db.prepare("SELECT payload,fetched FROM elevation_cache WHERE key=?").get(key);
    const fallback = () => ({ ...JSON.parse(cached.payload), stale: true });
    if (isOffline()) return cached ? res.json(fallback()) : res.status(503).json({ error: "No saved elevation profile for this path. Connect once to download it." });
    if (cached && Date.now() - cached.fetched < 30 * 24 * 60 * 60_000) return res.json(JSON.parse(cached.payload));
    try {
      if (!pending.has(key)) pending.set(key, (async () => {
        const points = samplePath(source, destination, endpointsOnly ? 2 : 33);
        const url = new URL("https://api.open-meteo.com/v1/elevation");
        url.search = new URLSearchParams({ latitude: points.map((p) => p.lat.toFixed(5)).join(","), longitude: points.map((p) => p.lng.toFixed(5)).join(",") }).toString();
        const response = await fetcher(url, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw Error("Elevation provider unavailable.");
        const data = await response.json();
        if (!Array.isArray(data.elevation) || data.elevation.length !== points.length || data.elevation.some((n) => !Number.isFinite(n) || n < -12000 || n > 10000))
          throw Error("Unexpected elevation response.");
        const value = { elevations: data.elevation, distanceKm, endpointsOnly, source: "Open-Meteo elevation API (DEM estimate)", spacingKm: distanceKm / (points.length - 1), fetchedAt: new Date().toISOString(), stale: false };
        db.prepare("INSERT OR REPLACE INTO elevation_cache VALUES(?,?,?)").run(key, JSON.stringify(value), Date.now());
        db.prepare("DELETE FROM elevation_cache WHERE key NOT IN (SELECT key FROM elevation_cache ORDER BY fetched DESC LIMIT 100)").run();
        return value;
      })().finally(() => pending.delete(key)));
      res.json(await pending.get(key));
    } catch {
      if (cached) res.json(fallback());
      else res.status(503).json({ error: "Elevation profile unavailable; no terrain clearance estimate can be made." });
    }
  });
}
