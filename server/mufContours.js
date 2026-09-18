export const MUF_CONTOURS =
  "https://prop.kc2g.com/renders/current/mufd-normal-now.geojson";
export function validateContours(data) {
  if (
    data?.type !== "FeatureCollection" ||
    !Array.isArray(data.features) ||
    !data.features.length ||
    data.features.length > 2000
  )
    throw Error("Invalid contours");
  let points = 0;
  const features = data.features.map((f) => {
    const mhz = f.properties?.["level-value"];
    if (
      !Number.isFinite(mhz) ||
      mhz <= 0 ||
      mhz > 200 ||
      f.geometry?.type !== "LineString" ||
      !Array.isArray(f.geometry.coordinates) ||
      f.geometry.coordinates.length < 2
    )
      throw Error("Invalid contour");
    const segments = [];
    let current = [];
    for (const p of f.geometry.coordinates) {
      if (
        ++points > 250000 ||
        !Array.isArray(p) ||
        p.length !== 2 ||
        !p.every(Number.isFinite) ||
        Math.abs(p[0]) > 180 ||
        Math.abs(p[1]) > 90
      )
        throw Error("Invalid contour coordinate");
      if (current.length && Math.abs(p[0] - current.at(-1)[0]) > 180) {
        if (current.length > 1) segments.push(current);
        current = [];
      }
      current.push(p);
    }
    if (current.length > 1) segments.push(current);
    return {
      type: "Feature",
      properties: { mhz, label: mhz.toFixed(1) + " MHz" },
      geometry: { type: "MultiLineString", coordinates: segments },
    };
  });
  return { type: "FeatureCollection", features };
}
export function installMufContours(app, db, { isOffline = () => false } = {}) {
  let pending;
  const cached = () => {
    try {
      const r = db
        .prepare("SELECT * FROM feed_cache WHERE name='muf-contours'")
        .get();
      return r ? { ...r, value: JSON.parse(r.value) } : null;
    } catch {
      return null;
    }
  };
  async function download() {
    const response = await fetch(MUF_CONTOURS, {
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw Error("Contour provider unavailable");
    const reader = response.body.getReader(),
      chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4 * 1024 * 1024) {
        await reader.cancel();
        throw Error("Contour response too large");
      }
      chunks.push(value);
    }
    const geojson = validateContours(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    const modified = Date.parse(response.headers.get("last-modified"));
    const value = {
      geojson,
      publishedAt: Number.isFinite(modified)
        ? new Date(modified).toISOString()
        : null,
      fetchedAt: new Date().toISOString(),
      source: MUF_CONTOURS,
    };
    db.prepare(
      "INSERT INTO feed_cache VALUES('muf-contours',?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value,fetched=excluded.fetched",
    ).run(JSON.stringify(value), Date.now());
    return value;
  }
  const view = (value, stale = false) => ({
    ...value,
    stale:
      stale ||
      !value.publishedAt ||
      Date.now() - Date.parse(value.publishedAt) > 90 * 60000,
    offline: isOffline(),
  });
  app.get("/api/muf-contours", async (req, res) => {
    const row = cached();
    if (isOffline()) {
      if (row) return res.json(view(row.value, true));
      return res
        .status(503)
        .json({
          error:
            "Offline: no saved MUF contours. Connect once to download modeled contour lines.",
        });
    }
    if (row && Date.now() - row.fetched < 300000)
      return res.json(view(row.value));
    try {
      if (!pending)
        pending = download().finally(() => {
          pending = null;
        });
      res.json(view(await pending, isOffline()));
    } catch {
      if (row) return res.json(view(row.value, true));
      res
        .status(502)
        .json({
          error:
            "Modeled MUF contour lines are unavailable. Station points are a separate observation feed.",
        });
    }
  });
}
