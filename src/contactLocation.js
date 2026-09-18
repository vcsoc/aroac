import { gridCenter } from "./lib.js";
import { validGrid } from "../shared/registration.js";
import { withTimezone } from "./locations.js";
export function contactLocation(contact, pins = []) {
  const callsign = (contact.callsign || "").trim().toUpperCase();
  const matches = callsign
    ? pins.filter(
        (pin) => (pin.callsign || "").trim().toUpperCase() === callsign,
      )
    : [];
  const title = contact.name || callsign || "Contact";
  if (matches.length === 1)
    return withTimezone({
      ...matches[0],
      title,
      kind: "contact",
      zoom: 14,
      locationSource: "Saved pin matched by callsign",
    });
  const grid = (contact.grid || "").trim().toUpperCase();
  if (grid && validGrid(grid))
    return withTimezone({
      ...gridCenter(grid),
      title,
      kind: "contact",
      zoom: grid.length === 6 ? 11 : 7,
      locationSource: `Approximate centre of grid ${grid}`,
    });
  throw Error(
    matches.length > 1
      ? "Several saved pins share this callsign. Choose the correct pin in Locations, or add a grid to this contact."
      : "No location saved for this contact. Add a Maidenhead grid, or save a location pin with this callsign.",
  );
}
export function isCardNavigationClick(event) {
  return !event.target.closest(
    "input,textarea,select,button,a,label,summary,details",
  );
}
