import { readFile } from "node:fs/promises";
import path from "node:path";
export const foldCity = (value) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function installCities(
  app,
  {
    citiesPath = path.resolve("data/cities.json"),
    db,
    isOffline = () => false,
    fetcher = fetch,
  } = {},
) {
  let loading;
  const countryNames = new Map(),
    display = new Intl.DisplayNames(["en"], { type: "region" });
  const country = (cc) => {
    if (!countryNames.has(cc)) {
      try {
        countryNames.set(cc, display.of(cc));
      } catch {
        countryNames.set(cc, cc);
      }
    }
    return countryNames.get(cc);
  };
  const load = () =>
    (loading ||= readFile(citiesPath, "utf8")
      .then((text) =>
        JSON.parse(text).map((row) => ({
          row,
          search: foldCity(
            [row[0], row[1], country(row[1]), row[2], row[5], row[7]].join(" "),
          ),
          name: foldCity(row[0]),
        })),
      )
      .catch((e) => {
        loading = null;
        throw e;
      }));
  db?.exec(
    "CREATE TABLE IF NOT EXISTS place_cache(key TEXT PRIMARY KEY,payload TEXT NOT NULL,fetched INTEGER NOT NULL)",
  );
  app.get("/api/places/reverse", async (req, res) => {
    const lat = Number(req.query.lat),
      lng = Number(req.query.lng);
    if (
      !req.query.lat ||
      !req.query.lng ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    )
      return res.status(400).json({ error: "Invalid coordinates." });
    const key = `${lat.toFixed(3)},${lng.toFixed(3)}`,
      cached = db?.prepare("SELECT * FROM place_cache WHERE key=?").get(key);
    if (cached && (isOffline() || Date.now() - cached.fetched < 30 * 86400000))
      return res.json({ ...JSON.parse(cached.payload), cached: true });
    if (!isOffline()) {
      try {
        const url = new URL("https://photon.komoot.io/reverse");
        url.search = new URLSearchParams({
          lat: String(lat),
          lon: String(lng),
          limit: "1",
          lang: "en",
        }).toString();
        const response = await fetcher(url, {
          signal: AbortSignal.timeout(6000),
        });
        if (response.ok) {
          const p = (await response.json()).features?.[0]?.properties;
          const name =
            p?.city ||
            p?.town ||
            p?.village ||
            (["city", "town", "village"].includes(p?.osm_value)
              ? p.name
              : null);
          if (name) {
            const value = {
              name,
              region: p.state || "",
              country: p.country || "",
              kind: "mapped",
              source: "Photon / OpenStreetMap",
            };
            db?.prepare("INSERT OR REPLACE INTO place_cache VALUES(?,?,?)").run(
              key,
              JSON.stringify(value),
              Date.now(),
            );
            db?.prepare(
              "DELETE FROM place_cache WHERE key NOT IN (SELECT key FROM place_cache ORDER BY fetched DESC LIMIT 500)",
            ).run();
            return res.json(value);
          }
        }
      } catch {}
    }
    try {
      const rows = await load(),
        rad = Math.PI / 180;
      let best = null,
        min = Infinity;
      for (const { row: r } of rows) {
        const a =
          Math.sin(((r[3] - lat) * rad) / 2) ** 2 +
          Math.cos(lat * rad) *
            Math.cos(r[3] * rad) *
            Math.sin(((r[4] - lng) * rad) / 2) ** 2;
        if (a < min) {
          min = a;
          best = r;
        }
      }
      if (!best) throw Error();
      res.json({
        name: best[0],
        region: best[2],
        country: country(best[1]),
        distanceKm: 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, min))),
        kind: "nearest",
        source: "GeoNames · CC BY 4.0",
        offline: isOffline(),
      });
    } catch {
      res
        .status(503)
        .json({
          error:
            "Place name unavailable. Coordinates and timezone remain available.",
        });
    }
  });
  app.get("/api/cities", async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (query.length > 120)
      return res.status(400).json({ error: "City query is too long." });
    try {
      const rows = await load(),
        q = foldCity(query),
        parts = q.split(" ").filter(Boolean);
      const matches = [];
      for (const entry of rows) {
        if (parts.every((p) => entry.search.includes(p))) {
          matches.push({
            entry,
            rank: entry.name === q ? 0 : entry.name.startsWith(q) ? 1 : 2,
          });
          if (!q && matches.length >= 30) break;
        }
      }
      matches.sort(
        (a, b) => a.rank - b.rank || b.entry.row[6] - a.entry.row[6],
      );
      res.json({
        total: rows.length,
        matches: matches.length,
        results: matches.slice(0, 40).map(({ entry: { row: r } }) => ({
          id: `city-${r[3]}-${r[4]}-${r[0]}`,
          title: r[0],
          subtitle: [r[2], country(r[1]), r[5]].filter(Boolean).join(" · "),
          lat: r[3],
          lng: r[4],
          zone: r[5],
          zoom: 11,
        })),
        source: "GeoNames · CC BY 4.0",
      });
    } catch {
      res.status(503).json({
        error:
          "Offline city directory unavailable. You can still enter an IANA timezone or search addresses.",
      });
    }
  });
}
