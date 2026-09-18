import SunCalc from "suncalc";
export const emptyGeoJSON = { type: "FeatureCollection", features: [] };
// Trace the solar horizon on each meridian; no network data is required.
export function nightGeometry(now = new Date()) {
  const edge = 89.999;
  const bounds = (lng) => {
    const south = SunCalc.getPosition(now, -edge, lng).altitude < 0;
    const north = SunCalc.getPosition(now, edge, lng).altitude < 0;
    if (south && north) return [-edge, edge];
    if (!south && !north) return [edge, edge];
    let lo = -edge,
      hi = edge;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (SunCalc.getPosition(now, mid, lng).altitude < 0 === south) lo = mid;
      else hi = mid;
    }
    return south ? [-edge, (lo + hi) / 2] : [(lo + hi) / 2, edge];
  };
  const features = [];
  for (let lng = -180; lng < 180; lng++) {
    const a = bounds(lng),
      b = bounds(lng + 1);
    if (a[0] === a[1] && b[0] === b[1]) continue;
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [lng, a[0]],
            [lng + 1, b[0]],
            [lng + 1, b[1]],
            [lng, a[1]],
            [lng, a[0]],
          ],
        ],
      },
    });
  }
  return { type: "FeatureCollection", features };
}
export function globeOverviewZoom(width, height) {
  // At zoom 0 the sphere's diameter is 512/pi CSS pixels.
  return Math.max(
    -1.5,
    Math.min(
      2,
      Math.log2(
        (Math.max(100, Math.min(width, height)) * 0.82 * Math.PI) / 512,
      ),
    ),
  );
}
