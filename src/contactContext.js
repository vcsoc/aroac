export function alphabeticalGroup(name) {
  const c =
    String(name)
      .trim()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()[0] || "#";
  return /[0-9]/.test(c) ? "0–9" : /[A-Z]/.test(c) ? c : "#";
}
export function horizonKm(sourceHeight, destinationHeight, k = 1) {
  return (
    3.57 *
    Math.sqrt(k) *
    (Math.sqrt(sourceHeight) + Math.sqrt(destinationHeight))
  );
}
export function utcOffset(zone, date) {
  const part = new Intl.DateTimeFormat("en", {
    timeZone: zone,
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName").value;
  if (part === "GMT") return 0;
  const m = part.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!m) throw Error("Timezone offset unavailable");
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}
export function homeDifference(zone, homeZone, date) {
  if (!homeZone) return "Home timezone not set";
  try {
    const mins = utcOffset(zone, date) - utcOffset(homeZone, date);
    return mins === 0
      ? "Same time as home"
      : `${mins > 0 ? "+" : "−"}${Math.floor(Math.abs(mins) / 60)}h ${Math.abs(mins) % 60}m vs home`;
  } catch {
    return "Home time difference unavailable";
  }
}
export function linkGeometry(home, destination) {
  if (
    ![home?.lat, home?.lng, destination?.lat, destination?.lng].every(
      Number.isFinite,
    )
  )
    return null;
  const rad = Math.PI / 180,
    a = home.lat * rad,
    b = destination.lat * rad,
    dl = (destination.lng - home.lng) * rad;
  const h =
    Math.sin((b - a) / 2) ** 2 +
    Math.cos(a) * Math.cos(b) * Math.sin(dl / 2) ** 2;
  const distance = 6371 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
  const bearing =
    distance < 1e-6 || Math.abs(distance - Math.PI * 6371) < 1e-6
      ? null
      : (Math.atan2(
          Math.sin(dl) * Math.cos(b),
          Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(dl),
        ) /
          rad +
          360) %
        360;
  return { distance, bearing };
}
