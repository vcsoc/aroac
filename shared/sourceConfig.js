import { parseDocument } from "yaml";
export const SOURCE_LIMIT = 128 * 1024;
export const adapters = Object.freeze({
  weather: "open-meteo",
  radar: "rainviewer",
  muf: "giro-stations",
  mufContours: "muf-geojson",
  repeaters: "hearham",
  kp: "noaa-kp",
  solar: "noaa-flux",
  iss: "wheretheiss",
  geocoding: "photon",
  reverseGeocoding: "photon",
  mapRaster: "xyz-raster",
  mapVector: "openmaptiles",
  mapGlyphs: "maplibre-glyphs",
});
export function safeSourceUrl(value) {
  if (typeof value !== "string" || value.length > 2048)
    throw Error("Source URL must be an HTTPS URL of at most 2048 characters.");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== "443") ||
    !url.hostname.includes(".") ||
    /(^|\.)(localhost|local|internal|lan|test|invalid)$/i.test(url.hostname) ||
    /^[\d.]+$/.test(url.hostname) ||
    url.hostname.includes(":") ||
    url.hostname.startsWith("[")
  )
    throw Error(
      "Only public HTTPS hostnames on port 443 without credentials are allowed.",
    );
  return value;
}
export function parseSources(text) {
  if (
    typeof text !== "string" ||
    new TextEncoder().encode(text).length > SOURCE_LIMIT
  )
    throw Error("Source configuration exceeds 128 KiB.");
  const doc = parseDocument(text, { uniqueKeys: true });
  if (doc.errors.length)
    throw Error("YAML parse error: " + doc.errors[0].message);
  const data = doc.toJS({ maxAliasCount: 0 });
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.sources) ||
    !data.sources.length ||
    data.sources.length > 300 ||
    Object.keys(data).some((k) => !["version", "sources"].includes(k))
  )
    throw Error("Expected version: 1 and a sources list (1–300 entries).");
  const ids = new Set();
  for (const s of data.sources) {
    if (
      !s ||
      typeof s !== "object" ||
      Object.keys(s).some(
        (k) =>
          ![
            "id",
            "kind",
            "adapter",
            "countries",
            "url",
            "attribution",
            "enabled",
          ].includes(k),
      )
    )
      throw Error(
        "Unknown source field. Supported fields: id, kind, adapter, countries, url, attribution, enabled.",
      );
    if (
      typeof s.id !== "string" ||
      !/^[a-z0-9-]{1,64}$/.test(s.id) ||
      ids.has(s.id)
    )
      throw Error("Every source needs a unique lowercase id.");
    ids.add(s.id);
    if (!Object.hasOwn(adapters, s.kind) || s.adapter !== adapters[s.kind])
      throw Error(
        "Unsupported kind/adapter for " +
          s.id +
          ". A different API format requires an OAR adapter.",
      );
    if (
      !Array.isArray(s.countries) ||
      !s.countries.length ||
      s.countries.length > 260 ||
      s.countries.some(
        (c) => typeof c !== "string" || !/^(\*|[A-Z]{2})$/.test(c),
      )
    )
      throw Error(
        "Countries must contain * or uppercase ISO alpha-2 country codes.",
      );
    if (
      typeof s.attribution !== "string" ||
      !s.attribution.trim() ||
      s.attribution.length > 500 ||
      /[<>]/.test(s.attribution)
    )
      throw Error("A source attribution is required.");
    if (s.enabled !== undefined && typeof s.enabled !== "boolean")
      throw Error("enabled must be true or false.");
    safeSourceUrl(s.url);
    if (
      s.kind === "mapRaster" &&
      ["{z}", "{x}", "{y}"].some((v) => !s.url.includes(v))
    )
      throw Error("Raster URL requires {z}, {x}, {y} placeholders.");
    if (
      s.kind === "mapGlyphs" &&
      ["{fontstack}", "{range}"].some((v) => !s.url.includes(v))
    )
      throw Error("Glyph URL requires {fontstack} and {range}.");
  }
  for (const kind of Object.keys(adapters))
    if (
      !data.sources.some(
        (s) =>
          s.kind === kind && s.enabled !== false && s.countries.includes("*"),
      )
    )
      throw Error("Keep an enabled global (*) fallback for " + kind + ".");
  return data;
}
export function selectSources(config, kind, country) {
  const all = config.sources.filter(
    (s) => s.kind === kind && s.enabled !== false,
  );
  return [
    ...all.filter(
      (s) =>
        country && s.countries.includes(country) && !s.countries.includes("*"),
    ),
    ...all.filter((s) => s.countries.includes("*")),
  ];
}
