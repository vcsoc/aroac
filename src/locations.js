import tzlookup from "tz-lookup";
import { maidenhead } from "./lib.js";
export function coordinatesFromQuery(query) {
  const match = query.match(
    /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/,
  );
  if (!match) return null;
  const lat = Number(match[1]),
    lng = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    id: "coordinates",
    title: `${lat}, ${lng}`,
    subtitle: "Coordinates",
    lat,
    lng,
    zoom: 12,
  };
}
export function withTimezone(place) {
  let zone = "UTC";
  try {
    zone = tzlookup(place.lat, place.lng);
  } catch {}
  return { ...place, zone, grid: maidenhead(place.lat, place.lng) };
}
