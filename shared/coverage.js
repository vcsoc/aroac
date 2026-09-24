// Local planning geometry, NOT a propagation/reliability prediction or terrain solver.
const R = 6371.0088,
  DEG = Math.PI / 180;
export const COVERAGE_BANDS = [
  ["160m", 1.9, 1.8, 2],
  ["80m", 3.7, 3.5, 4],
  ["60m", 5.35, 5.25, 5.45],
  ["40m", 7.1, 7, 7.3],
  ["30m", 10.12, 10.1, 10.15],
  ["20m", 14.2, 14, 14.35],
  ["17m", 18.1, 18.068, 18.168],
  ["15m", 21.2, 21, 21.45],
  ["12m", 24.94, 24.89, 24.99],
  ["10m", 28.5, 28, 29.7],
  ["6m", 50.5, 50, 54],
  ["2m", 145, 144, 148],
  ["1.25m", 223.5, 222, 225],
  ["70cm", 435, 420, 450],
  ["23cm", 1296, 1240, 1300],
].map(([id, mhz, low, high]) => ({ id, mhz, low, high, hf: mhz < 30 }));
export const DEFAULT_COVERAGE = Object.freeze({
  enabled: false,
  band: "2m",
  txHeight: 10,
  rxHeight: 1.5,
  repeaterHeight: 30,
  power: 5,
  sensitivity: -110,
  margin: 20,
  hmF2: 300,
  foF2: 7,
  minElevation: 5,
});
const bounded = (v, fallback, min, max) =>
  Number.isFinite(Number(v)) && v !== "" && v != null
    ? Math.max(min, Math.min(max, Number(v)))
    : fallback;
export function normalizeCoverage(value = {}) {
  if (!value || typeof value !== "object") value = {};
  return {
    enabled: value.enabled === true,
    band: COVERAGE_BANDS.some((b) => b.id === value.band) ? value.band : "2m",
    txHeight: bounded(value.txHeight, 10, 0.5, 500),
    rxHeight: bounded(value.rxHeight, 1.5, 0.5, 500),
    repeaterHeight: bounded(value.repeaterHeight, 30, 0.5, 1000),
    power: bounded(value.power, 5, 0.001, 1500),
    sensitivity: bounded(value.sensitivity, -110, -140, -50),
    margin: bounded(value.margin, 20, 0, 60),
    hmF2: bounded(value.hmF2, 300, 150, 500),
    foF2: bounded(value.foF2, 7, 1, 20),
    minElevation: bounded(value.minElevation, 5, 1, 45),
  };
}
export function validOrigin(p) {
  return (
    !!p &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}
export function distanceKm(a, b) {
  const dLat = (b.lat - a.lat) * DEG,
    dLng = (b.lng - a.lng) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}
export function localRadius(
  settings,
  mhz,
  h1 = settings.txHeight,
  h2 = settings.rxHeight,
) {
  // Standard 4/3-Earth radio horizon. Heights are above surrounding ground, NOT sea level.
  const horizon = 4.12 * (Math.sqrt(h1) + Math.sqrt(h2));
  // Isotropic antennas, 6 dB combined feeder/system loss, user fade margin.
  const budget =
    10 * Math.log10(settings.power * 1000) -
    6 -
    settings.sensitivity -
    settings.margin;
  const link = 10 ** ((budget - 32.44 - 20 * Math.log10(mhz)) / 20);
  return Math.min(horizon, link);
}
export function hfEnvelope(settings, mhz) {
  // Thin-shell spherical single-hop F2 geometry; secant law is an approximation.
  const q = R / (R + settings.hmF2),
    low = settings.minElevation * DEG;
  const muf = settings.foF2 / Math.sqrt(1 - (q * Math.cos(low)) ** 2);
  if (mhz > muf) return { innerKm: 0, outerKm: 0, muf };
  const maxElevation =
    mhz <= settings.foF2
      ? Math.PI / 2
      : Math.acos(Math.min(1, Math.sqrt(1 - (settings.foF2 / mhz) ** 2) / q));
  const hop = (angle) => 2 * R * (Math.acos(q * Math.cos(angle)) - angle);
  return { innerKm: Math.max(0, hop(maxElevation)), outerKm: hop(low), muf };
}
// Split line rings at the dateline rather than drawing a line across the entire map.
export function rangeRing(origin, km, properties = {}) {
  const coordinates = [],
    segments = [[]];
  for (let i = 0; i <= 180; i++) {
    const bearing = i * 2 * DEG,
      d = km / R,
      lat = origin.lat * DEG;
    const p = Math.asin(
      Math.max(
        -1,
        Math.min(
          1,
          Math.sin(lat) * Math.cos(d) +
            Math.cos(lat) * Math.sin(d) * Math.cos(bearing),
        ),
      ),
    );
    const lng =
      origin.lng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(d) * Math.cos(lat),
        Math.cos(d) - Math.sin(lat) * Math.sin(p),
      ) /
        DEG;
    coordinates.push([((lng + 540) % 360) - 180, p / DEG]);
  }
  for (const point of coordinates) {
    let segment = segments.at(-1),
      previous = segment.at(-1);
    if (previous && Math.abs(point[0] - previous[0]) > 180) {
      const edge = previous[0] > 0 ? 180 : -180;
      const adjusted = point[0] + (previous[0] > 0 ? 360 : -360);
      const lat =
        previous[1] +
        ((point[1] - previous[1]) * (edge - previous[0])) /
          (adjusted - previous[0]);
      segment.push([edge, lat]);
      segments.push([[-edge, lat]]);
      segment = segments.at(-1);
    }
    segment.push(point);
  }
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "MultiLineString",
      coordinates: segments.filter((s) => s.length > 1),
    },
  };
}
// Fit the band's range, not an independently selected (possibly distant) repeater.
// Unwrap around the origin so a dateline crossing remains a local view.
export function coverageBounds(coverage) {
  const origin = coverage.features.find((f) => f.properties.kind === "origin");
  const rings = coverage.features.filter((f) =>
    ["direct", "secondary"].includes(f.properties.kind),
  );
  if (!origin || !rings.length) return null;
  const center = origin.geometry.coordinates[0];
  let west = Infinity,
    east = -Infinity,
    south = Infinity,
    north = -Infinity;
  for (const ring of rings) {
    for (const line of ring.geometry.coordinates) {
      for (const [lng, lat] of line) {
        const x = center + ((lng - center + 540) % 360) - 180;
        west = Math.min(west, x);
        east = Math.max(east, x);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
      }
    }
  }
  // Mercator cannot display the poles; keep camera inputs finite there.
  const clampLatitude = (lat) => Math.max(-85.051129, Math.min(85.051129, lat));
  return [
    [west, clampLatitude(south)],
    [east, clampLatitude(north)],
  ];
}

export function repeaterFootprint(repeater, input) {
  if (
    !validOrigin(repeater) ||
    !Number.isFinite(repeater.frequencyMHz) ||
    repeater.frequencyMHz < 30
  )
    return null;
  const settings = normalizeCoverage(input);
  const radiusKm = localRadius(
    settings,
    repeater.frequencyMHz,
    settings.repeaterHeight,
    settings.rxHeight,
  );
  return {
    radiusKm,
    feature: rangeRing(repeater, radiusKm, {
      kind: "selected-repeater",
      label: repeater.callsign || "Selected repeater",
    }),
  };
}
export function buildCoverage(origin, input, repeaters = []) {
  const settings = normalizeCoverage(input),
    band = COVERAGE_BANDS.find((b) => b.id === settings.band);
  const result = {
    type: "FeatureCollection",
    features: [],
    band,
    settings,
    directKm: 0,
    eligible: 0,
    shown: 0,
    capped: false,
  };
  if (!settings.enabled || !validOrigin(origin)) return result;
  const add = (p, km, kind, label) => {
    if (km > 0.01) result.features.push(rangeRing(p, km, { kind, label }));
  };
  result.features.push({
    type: "Feature",
    properties: { kind: "origin" },
    geometry: { type: "Point", coordinates: [origin.lng, origin.lat] },
  });
  if (band.hf) {
    Object.assign(result, hfEnvelope(settings, band.mhz));
    add(origin, result.outerKm, "direct", "F2 outer boundary");
    add(origin, result.innerKm, "skip", "F2 skip boundary");
    return result;
  }
  result.directKm = localRadius(settings, band.mhz);
  add(
    origin,
    result.directKm,
    "direct",
    "Direct radio-horizon/link-budget limit",
  );
  const candidates = repeaters
    .filter(
      (p) =>
        validOrigin(p) &&
        Number.isFinite(p.frequencyMHz) &&
        p.frequencyMHz >= band.low &&
        p.frequencyMHz <= band.high &&
        Number.isFinite(p.offsetMHz) &&
        p.frequencyMHz + p.offsetMHz >= band.low &&
        p.frequencyMHz + p.offsetMHz <= band.high,
    )
    .map((p) => ({ p, distance: distanceKm(origin, p) }))
    .filter(
      ({ p, distance }) =>
        distance <=
        Math.min(
          localRadius(
            settings,
            p.frequencyMHz + p.offsetMHz,
            settings.txHeight,
            settings.repeaterHeight,
          ),
          localRadius(
            settings,
            p.frequencyMHz,
            settings.repeaterHeight,
            settings.txHeight,
          ),
        ),
    )
    .sort((a, b) => a.distance - b.distance);
  result.eligible = candidates.length;
  result.shown = Math.min(40, candidates.length);
  result.capped = candidates.length > 40;
  for (const { p } of candidates.slice(0, 40)) {
    // Symmetric assumed equipment/power. Directory does not provide reliable site heights or ERP.
    const radius = localRadius(
      settings,
      p.frequencyMHz,
      settings.repeaterHeight,
      settings.rxHeight,
    );
    add(p, radius, "secondary", p.callsign || "Candidate repeater");
  }
  return result;
}
