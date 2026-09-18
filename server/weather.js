export function installWeather(
  app,
  db,
  { isOffline = () => false, fetcher = fetch } = {},
) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS weather_cache (key TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched INTEGER NOT NULL)",
  );
  const pending = new Map();
  app.get("/api/weather", async (req, res) => {
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
      return res.status(400).json({ error: "Invalid weather coordinates." });
    const key = `${lat.toFixed(3)},${lng.toFixed(3)}`,
      cached = db.prepare("SELECT * FROM weather_cache WHERE key=?").get(key);
    const fallback = () => ({
      ...JSON.parse(cached.payload),
      stale: true,
      offline: isOffline(),
    });
    if (isOffline())
      return cached
        ? res.json(fallback())
        : res.status(503).json({
            error:
              "No saved weather for this location. Connect once to download it.",
          });
    if (cached && Date.now() - cached.fetched < 15 * 60_000)
      return res.json(JSON.parse(cached.payload));
    try {
      if (!pending.has(key))
        pending.set(
          key,
          (async () => {
            const url = new URL("https://api.open-meteo.com/v1/forecast");
            url.search = new URLSearchParams({
              latitude: lat.toFixed(3),
              longitude: lng.toFixed(3),
              current:
                "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
              hourly: "visibility,dew_point_2m",
              daily:
                "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max",
              timezone: "auto",
              forecast_days: "7",
              timeformat: "unixtime",
            }).toString();
            const response = await fetcher(url, {
              signal: AbortSignal.timeout(20000),
            });
            if (!response.ok) throw Error("Weather provider unavailable.");
            const data = await response.json();
            if (
              !data.current ||
              !Array.isArray(data.daily?.time) ||
              data.daily.time.length > 8
            )
              throw Error("Unexpected weather response.");
            const value = {
              ...data,
              fetchedAt: new Date().toISOString(),
              source: response.oarSource?.attribution || "Open-Meteo",
              sourceUrl: response.oarSource?.url,
              stale: false,
            };
            db.prepare(
              "INSERT OR REPLACE INTO weather_cache VALUES(?,?,?)",
            ).run(key, JSON.stringify(value), Date.now());
            db.prepare(
              "DELETE FROM weather_cache WHERE key NOT IN (SELECT key FROM weather_cache ORDER BY fetched DESC LIMIT 500)",
            ).run();
            return value;
          })().finally(() => pending.delete(key)),
        );
      res.json(await pending.get(key));
    } catch (e) {
      if (cached) res.json(fallback());
      else
        res.status(503).json({
          error:
            e.message === "Weather provider unavailable."
              ? e.message
              : "Weather could not be downloaded. Try again when online.",
        });
    }
  });
}
