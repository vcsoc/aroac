import { useEffect, useId, useRef, useState } from "react";
import { api } from "./lib";
const zones = ["UTC", ...Intl.supportedValuesOf("timeZone")];
const fold = (s) =>
  s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replaceAll("_", " ");
export default function CityTimezonePicker({ value, onChange, onPlace }) {
  const id = useId(),
    host = useRef(),
    [open, setOpen] = useState(false),
    [filter, setFilter] = useState(""),
    [cities, setCities] = useState([]),
    [status, setStatus] = useState(""),
    [active, setActive] = useState(-1);
  useEffect(() => {
    const outside = (e) => {
      if (!host.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", outside);
    return () => document.removeEventListener("click", outside);
  }, []);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setCities([]);
    setStatus("Searching offline cities…");
    const timer = setTimeout(
      () =>
        api("/cities?q=" + encodeURIComponent(filter))
          .then((data) => {
            if (live) {
              setCities(data.results);
              setStatus(
                `${data.total.toLocaleString()} cities/towns offline · GeoNames (CC BY 4.0). Showing up to 40 city matches; refine your search.`,
              );
            }
          })
          .catch((e) => {
            if (live) setStatus(e.message);
          }),
      180,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [filter, open]);
  const needle = fold(filter);
  const zoneItems = zones
    .filter((z) => fold(z).includes(needle))
    .map((zone) => ({
      id: zone,
      zone,
      title: zone.split("/").at(-1).replaceAll("_", " "),
      subtitle: zone,
      isZone: true,
    }));
  const items =
    filter.includes("/") || filter.toUpperCase() === "UTC"
      ? [...zoneItems, ...cities]
      : [...cities, ...zoneItems];
  function choose(item) {
    if (item.isZone) onChange(item.zone);
    else onPlace(item);
    setOpen(false);
    setActive(-1);
  }
  return (
    <div className="city-timezone-picker" ref={host}>
      <label htmlFor={id}>Timezone</label>
      <input
        id={id}
        required
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={id + "-list"}
        aria-activedescendant={active >= 0 ? id + "-" + active : undefined}
        autoComplete="off"
        placeholder="Type a city, country or IANA timezone…"
        value={value}
        onClick={(e) => e.currentTarget.select()}
        onFocus={(e) => {
          e.target.select();
          setFilter("");
          setActive(-1);
          setOpen(true);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setFilter(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
          if (["ArrowDown", "ArrowUp"].includes(e.key)) {
            e.preventDefault();
            setOpen(true);
            setActive((a) =>
              Math.max(
                0,
                Math.min(
                  items.length - 1,
                  a + (e.key === "ArrowDown" ? 1 : -1),
                ),
              ),
            );
          }
          if (e.key === "Enter" && open && items.length) {
            e.preventDefault();
            choose(items[Math.max(0, active)]);
          }
        }}
      />
      {open && (
        <div className="city-options">
          <div
            role="listbox"
            aria-label="Cities and timezones"
            id={id + "-list"}
          >
            {items.map((item, i) => (
              <button
                type="button"
                role="option"
                id={id + "-" + i}
                aria-selected={i === active}
                key={item.id}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(item)}
              >
                <b>
                  {item.title}
                  {item.isZone ? " · timezone" : ""}
                </b>
                <small>{item.subtitle}</small>
              </button>
            ))}
          </div>
          <small role="status">{status}</small>
          {!items.length && (
            <p>
              No match yet. Try another spelling, or use address search for
              smaller places.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
