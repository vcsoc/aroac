export const themeColors = {
  background: "#101513",
  sidebar: "#141c17",
  panel: "#18231b",
  surface: "#29382b",
  text: "#e2e9e2",
  muted: "#96a58e",
  accent: "#c4ed9e",
  activeIcon: "#9cff57",
  border: "#354139",
  buttonText: "#172415",
  selection: "#354c2b",
  danger: "#ef9990",
  mapNight: "#030b1a",
  savedPin: "#82bc50",
  repeater: "#ffb86b",
};
export const defaultTheme = {
  format: "oar-theme",
  version: 1,
  name: "OAR dark",
  colors: themeColors,
};
export function validateTheme(value) {
  if (
    !value ||
    value.format !== "oar-theme" ||
    value.version !== 1 ||
    !value.colors ||
    typeof value.name !== "string" ||
    value.name.length > 80
  )
    throw Error("Not a supported OAR theme (version 1).");
  const colors = {};
  for (const key of Object.keys(themeColors)) {
    // Added to theme v1: older saved/imported themes remain valid. An explicitly
    // supplied malformed value still fails validation rather than being hidden.
    const color =
      key === "activeIcon" && !Object.hasOwn(value.colors, key)
        ? themeColors.activeIcon
        : value.colors[key];
    if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color))
      throw Error(`Invalid ${key} color; use #RRGGBB.`);
    colors[key] = color;
  }
  if (Object.keys(value.colors).some((k) => !Object.hasOwn(themeColors, k)))
    throw Error("Unknown theme color.");
  return {
    format: "oar-theme",
    version: 1,
    name: value.name.trim() || "Custom",
    colors,
  };
}
export function validZone(zone) {
  try {
    if (typeof zone !== "string" || !zone) return false;
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
export function validatePlace(v) {
  if (
    !v ||
    typeof v.name !== "string" ||
    !v.name.trim() ||
    v.name.length > 120 ||
    !validZone(v.zone)
  )
    throw Error("Choose a location name and a valid IANA timezone.");
  const hasLat = v.lat != null,
    hasLng = v.lng != null;
  if (
    hasLat !== hasLng ||
    (hasLat &&
      (typeof v.lat !== "number" ||
        typeof v.lng !== "number" ||
        !Number.isFinite(v.lat) ||
        !Number.isFinite(v.lng) ||
        Math.abs(v.lat) > 90 ||
        Math.abs(v.lng) > 180))
  )
    throw Error("Enter both latitude and longitude within their valid ranges.");
  if (
    v.color != null &&
    v.color !== "" &&
    (typeof v.color !== "string" || !/^#[0-9a-f]{6}$/i.test(v.color))
  )
    throw Error("Clock color must be #RRGGBB.");
  return {
    ...(v.color ? { color: v.color } : {}),
    name: v.name.trim(),
    zone: v.zone,
    lat: hasLat ? v.lat : null,
    lng: hasLng ? v.lng : null,
  };
}
export function defaultTimeConfig() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return {
    home: {
      name: zone.split("/").at(-1).replaceAll("_", " "),
      zone,
      lat: null,
      lng: null,
    },
    clocks: [
      { id: "utc", name: "Universal time", zone: "UTC", lat: null, lng: null },
      {
        id: "new-york",
        name: "New York",
        zone: "America/New_York",
        lat: null,
        lng: null,
      },
      {
        id: "london",
        name: "London",
        zone: "Europe/London",
        lat: null,
        lng: null,
      },
      { id: "tokyo", name: "Tokyo", zone: "Asia/Tokyo", lat: null, lng: null },
    ],
  };
}
export function validateTimeConfig(v) {
  if (!v || !Array.isArray(v.clocks) || v.clocks.length > 24)
    throw Error("Choose up to 24 additional clocks.");
  const ids = new Set();
  return {
    home: validatePlace(v.home),
    clocks: v.clocks.map((c) => {
      if (!/^[a-z0-9-]{1,60}$/i.test(c.id) || c.id === "home" || ids.has(c.id))
        throw Error("Invalid or duplicate clock ID.");
      ids.add(c.id);
      return { id: c.id, ...validatePlace(c) };
    }),
  };
}
