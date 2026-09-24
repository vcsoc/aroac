import SunCalc from "suncalc";
export const emptyGeoJSON = { type: "FeatureCollection", features: [] };
// Trace the solar horizon on each meridian; no network data is required.
export function nightGeometry(now = new Date(), altitudeDegrees = 0) {
  const edge = 89.999;
  const threshold = (altitudeDegrees * Math.PI) / 180;
  const bounds = (lng) => {
    const dark = (lat) =>
      SunCalc.getPosition(now, lat, lng).altitude < threshold;
    const intervals = [];
    let previous = -edge;
    let wasDark = dark(previous);
    let start = wasDark ? previous : null;
    // Twilight can leave both poles sunlit while the equator is dark (or vice versa).
    // Sample meridians before refining each crossing, rather than assuming one edge.
    for (let lat = -84; lat <= edge + 6; lat += 6) {
      const next = Math.min(edge, lat);
      const isDark = dark(next);
      if (isDark !== wasDark) {
        let lo = previous;
        let hi = next;
        for (let i = 0; i < 18; i++) {
          const mid = (lo + hi) / 2;
          if (dark(mid) === wasDark) lo = mid;
          else hi = mid;
        }
        const crossing = (lo + hi) / 2;
        if (wasDark) intervals.push([start, crossing]);
        else start = crossing;
      }
      previous = next;
      wasDark = isDark;
      if (next === edge) break;
    }
    if (wasDark) intervals.push([start, edge]);
    return intervals;
  };
  const features = [];
  for (let lng = -180; lng < 180; lng++) {
    const left = bounds(lng);
    const right = bounds(lng + 1);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const a = left[i] || [right[i][0], right[i][0]];
      const b = right[i] || [left[i][1], left[i][1]];
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
