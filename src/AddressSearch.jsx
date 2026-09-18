import { useEffect, useId, useRef, useState } from "react";
import { Search, X, MapPin } from "lucide-react";
import { api } from "./lib";
import { Help } from "./InterfaceUI";
import { contactLocation } from "./contactLocation";
import { coordinatesFromQuery, withTimezone } from "./locations";
export default function AddressSearch({ onSelect, onClear, onSavedSelect }) {
  const id = useId(),
    host = useRef(),
    input = useRef(),
    generation = useRef(0),
    timer = useRef(),
    suppressFocus = useRef(false);
  const [query, setQuery] = useState(""),
    [results, setResults] = useState([]),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [active, setActive] = useState(-1);
  useEffect(() => {
    const outside = (e) => {
      if (!host.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", outside);
    return () => {
      generation.current++;
      clearTimeout(timer.current);
      document.removeEventListener("click", outside);
    };
  }, []);
  function choose(place) {
    generation.current++;
    clearTimeout(timer.current);
    setBusy(false);
    setQuery(place.title);
    setActive(-1);
    suppressFocus.current = true;
    input.current?.focus();
    suppressFocus.current = false;
    setOpen(false);
    if (place.savedKind) onSavedSelect?.(place);
    if (place.unlocated) {
      setMessage(place.subtitle);
      setOpen(!onSavedSelect);
      return;
    }
    onSelect(
      withTimezone({
        ...place,
        ...(place.id === "coordinates" || place.savedKind
          ? {}
          : { searchQuery: query.trim() }),
      }),
    );
  }
  async function lookup(q, online = false) {
    const token = ++generation.current;
    setActive(-1);
    setOpen(true);
    setResults([]);
    setMessage("");
    const coords = coordinatesFromQuery(q);
    if (coords) {
      setResults([coords]);
      setBusy(false);
      return;
    }
    if (q.length < 3) {
      setBusy(false);
      setMessage("Type at least 3 characters.");
      return;
    }
    setBusy(true);
    try {
      if (!online) {
        const saved = await api("/saved-search?q=" + encodeURIComponent(q));
        if (token !== generation.current) return;
        const local = [
          ...saved.pins.map((pin) => ({
            ...pin,
            id: "saved-pin-" + pin.id,
            savedKind: "pin",
            savedId: pin.id,
            title: [pin.name, pin.callsign, pin.label]
              .filter(Boolean)
              .join(" · "),
            subtitle: "Saved location · exact pin",
            zoom: 14,
          })),
          ...saved.contacts.map((contact) => {
            let location = {};
            try {
              location = contactLocation(contact, saved.contactPins);
            } catch (e) {
              location = { unlocated: true, locationSource: e.message };
            }
            return {
              ...location,
              id: "saved-contact-" + contact.id,
              savedKind: "contact",
              savedId: contact.id,
              title: [contact.name, contact.callsign]
                .filter(Boolean)
                .join(" · "),
              subtitle: "Saved contact · " + location.locationSource,
            };
          }),
        ];
        if (local.length) {
          setResults(local);
          setMessage(
            "Saved on this device. This matching query was not sent to an online provider.",
          );
          return;
        }
      }
      const data = await api("/geocode?q=" + encodeURIComponent(q));
      if (token !== generation.current) return;
      setResults(data.results);
      setMessage(
        data.results.length
          ? (data.cached ? "Saved results · " : "") +
              "Photon / OpenStreetMap · address positions may be approximate"
          : "No matching address. Include the city and country.",
      );
    } catch (e) {
      if (token === generation.current) setMessage(e.message);
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  function search(e) {
    e.preventDefault();
    clearTimeout(timer.current);
    if (active >= 0 && results[active] && open) {
      choose(results[active]);
      return;
    }
    const q = query.trim();
    if (!q) return;
    const coords = coordinatesFromQuery(q);
    if (coords) {
      choose(coords);
      return;
    }
    lookup(q);
  }
  return (
    <div className="address-search" ref={host}>
      <form role="search" onSubmit={search}>
        <Search size={15} />
        <input
          ref={input}
          aria-label="Search addresses and places"
          role="combobox"
          aria-expanded={open}
          aria-controls={id}
          aria-activedescendant={active >= 0 ? id + "-" + active : undefined}
          autoComplete="off"
          placeholder="Search contact name, callsign, address or coordinates…"
          value={query}
          maxLength={200}
          onFocus={() => {
            if (!suppressFocus.current && (results.length || message))
              setOpen(true);
          }}
          onChange={(e) => {
            clearTimeout(timer.current);
            generation.current++;
            const value = e.target.value;
            setQuery(value);
            if (!value.trim()) onClear?.();
            setResults([]);
            setMessage("");
            setActive(-1);
            setBusy(false);
            setOpen(value.trim().length >= 3);
            if (value.trim().length >= 3) {
              setBusy(true);
              timer.current = setTimeout(() => lookup(value.trim()), 450);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              clearTimeout(timer.current);
              generation.current++;
              setBusy(false);
              setOpen(false);
              setActive(-1);
            }
            if (e.key === "ArrowDown" && results.length) {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, results.length - 1));
            }
            if (e.key === "ArrowUp" && results.length) {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            }
          }}
        />
        {query && (
          <button
            type="button"
            className="icon-button"
            aria-label="Clear address search"
            onClick={() => {
              clearTimeout(timer.current);
              generation.current++;
              setQuery("");
              onClear?.();
              setResults([]);
              setMessage("");
              setOpen(false);
              setBusy(false);
              input.current?.focus();
            }}
          >
            <X size={13} />
          </button>
        )}
        <button
          className="search-submit"
          disabled={!query.trim()}
          aria-label="Search location"
        >
          {busy ? "…" : "Go"}
        </button>
      </form>
      {open && (
        <div className="address-dropdown">
          <div id={id} role="listbox" aria-label="Address results">
            {results.map((place, i) => (
              <button
                type="button"
                role="option"
                aria-selected={active === i}
                id={id + "-" + i}
                key={place.id}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(place)}
              >
                <MapPin size={15} />
                <span>
                  <b>{place.title}</b>
                  <small>
                    {place.subtitle}
                    {place.corrected
                      ? " · position corrected on this device"
                      : ""}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <small role="status">{busy ? "Finding addresses…" : message}</small>
          {results.some((p) => p.savedKind) && (
            <button type="button" onClick={() => lookup(query.trim(), true)}>
              Search online places instead
            </button>
          )}
          <Help label="About location search">
            Saved names and callsigns are searched locally first. If none match,
            suggestions send your query to Photon/OpenStreetMap after a short
            pause. City/timezone search in the clock editor works offline.
            Verify address positions; a saved pin can correct them.
          </Help>
        </div>
      )}
    </div>
  );
}
