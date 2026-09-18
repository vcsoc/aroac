import { useEffect, useId, useRef, useState } from "react";
import { Plus, X, RotateCcw, Trash2, LocateFixed } from "lucide-react";
import AddressSearch from "./AddressSearch";
import { Help } from "./InterfaceUI";
import { toast } from "./Toasts";
import { withTimezone } from "./locations";
import { validatePlace, validateTimeConfig } from "../shared/workspace";
import CityTimezonePicker from "./CityTimezonePicker";
export function clockInk(hex) {
  const rgb = hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179
    ? "#000000"
    : "#ffffff";
}
export function placeFromLocation(p) {
  const location = withTimezone(p);
  return {
    name: p.title || p.label || `${p.lat.toFixed(3)}, ${p.lng.toFixed(3)}`,
    zone: p.zone || location.zone,
    lat: p.lat,
    lng: p.lng,
  };
}
export function WorldTime({
  config,
  onSave,
  ready,
  editing,
  setEditing,
  pins = [],
  offset = 0,
  setOffset,
  followGrey = true,
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const instant = new Date(now + offset * 60000),
    all = [{ id: "home", ...config.home }, ...config.clocks];
  return (
    <section
      className="world-time"
      aria-label="World clocks"
      data-tutorial="clocks"
    >
      <div className="clock-strip world-clocks">
        {all.map((c) => (
          <button
            type="button"
            className="clock"
            data-custom-color={!!c.color}
            style={
              c.color
                ? {
                    "--clock-ink": c.color,
                    "--clock-outline": clockInk(c.color),
                  }
                : undefined
            }
            key={c.id}
            aria-label={`Edit ${c.id === "home" ? "Home Location Time" : c.name} clock`}
            title="Double-click to change location; Enter also opens the editor"
            onDoubleClick={() => ready && setEditing(c.id)}
            onKeyDown={(e) => {
              if (["Enter", " "].includes(e.key)) {
                e.preventDefault();
                if (ready) setEditing(c.id);
              }
            }}
          >
            <small>{c.id === "home" ? "Home Location Time" : c.name}</small>
            <strong>
              {new Intl.DateTimeFormat("en-GB", {
                timeZone: c.zone,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              }).format(instant)}
              {c.zone === "UTC" ? "Z" : ""}
            </strong>
            <span>
              {new Intl.DateTimeFormat("en-GB", {
                timeZone: c.zone,
                weekday: "short",
                day: "2-digit",
                month: "short",
              }).format(instant)}
            </span>
            <small className="clock-zone">
              {c.id === "home" ? c.name + " · " : ""}
              {c.zone}
            </small>
          </button>
        ))}
        <button
          className="clock-add"
          aria-label="Add clock"
          disabled={!ready || config.clocks.length >= 24}
          onClick={() => setEditing("add")}
        >
          <Plus size={16} /> Add clock
        </button>
      </div>
      <div className="time-comparison">
        <label htmlFor="clock-offset">
          {offset
            ? `Preview ${offset > 0 ? "+" : ""}${(offset / 60).toFixed(2)} h`
            : "Live time"}
        </label>
        <input
          id="clock-offset"
          style={{ "--range-progress": `${((offset + 1440) / 11520) * 100}%` }}
          type="range"
          min="-1440"
          max="10080"
          step="15"
          value={offset}
          onChange={(e) => setOffset(Number(e.target.value))}
          aria-label="Compare world clock times"
          aria-valuetext={`${offset} minutes from now`}
        />
        <button onClick={() => setOffset(0)} disabled={!offset}>
          <RotateCcw size={12} /> Now
        </button>
        <small>
          −1 day / +7 days · {followGrey ? "clocks + grey line" : "clocks only"}
        </small>
      </div>
      {editing && (
        <ClockEditor
          key={editing}
          pins={pins}
          home={editing === "home"}
          value={all.find((c) => c.id === editing)}
          onClose={() => setEditing(null)}
          onSave={async (value) => {
            const next =
              editing === "home"
                ? { ...config, home: value }
                : {
                    ...config,
                    clocks:
                      editing === "add"
                        ? [
                            ...config.clocks,
                            { id: crypto.randomUUID(), ...value },
                          ]
                        : config.clocks.map((c) =>
                            c.id === editing ? { id: c.id, ...value } : c,
                          ),
                  };
            await onSave(validateTimeConfig(next));
            setEditing(null);
          }}
          onRemove={
            editing !== "home" && editing !== "add"
              ? async () => {
                  await onSave({
                    ...config,
                    clocks: config.clocks.filter((c) => c.id !== editing),
                  });
                  setEditing(null);
                }
              : null
          }
        />
      )}
    </section>
  );
}
function ClockEditor({ value, home, onSave, onRemove, onClose, pins }) {
  const colorId = useId();
  const [draft, setDraft] = useState(
      value || { name: "", zone: "UTC", lat: null, lng: null },
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const ref = useRef();
  useEffect(() => {
    ref.current.showModal();
    const node = ref.current;
    return () => node.close();
  }, []);
  const change = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  async function save(e) {
    e.preventDefault();
    try {
      setBusy(true);
      const place = {
        ...draft,
        lat: draft.lat === "" || draft.lat == null ? null : Number(draft.lat),
        lng: draft.lng === "" || draft.lng == null ? null : Number(draft.lng),
      };
      await onSave(validatePlace(place));
      toast(
        home
          ? `Home location changed to “${place.name || place.zone}” (${place.zone}). ${Number.isFinite(place.lat) && Number.isFinite(place.lng) ? "Home weather and the map Home button now use its coordinates." : "Choose coordinates to enable home weather and map navigation."}`
          : `Saved world clock “${place.name || place.zone}” using ${place.zone}.`,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      className="workspace-dialog clock-editor"
      ref={ref}
      onCancel={onClose}
    >
      <header>
        <h2>
          {home ? "Home Location Time" : value ? "Edit clock" : "Add clock"}
          <Help label="About clock locations">
            Search for an address below, or type a city directly in the timezone
            field. City suggestions are available offline. Select a result to
            set its name, coordinates and timezone together. Daylight-saving
            changes are automatic.
          </Help>
        </h2>
        <button aria-label="Close clock editor" onClick={onClose}>
          <X size={17} />
        </button>
      </header>
      <AddressSearch
        onSelect={(p) =>
          setDraft((d) => ({ ...placeFromLocation(p), color: d.color }))
        }
      />
      {!!pins.length && (
        <details className="saved-clock-places">
          <summary>Use coordinates from a saved pin</summary>
          {pins.map((pin) => (
            <button
              type="button"
              key={pin.id}
              onClick={() =>
                setDraft((d) => ({
                  ...placeFromLocation({ ...pin, title: pin.label }),
                  color: d.color,
                }))
              }
            >
              {pin.label} ·{" "}
              {pin.callsign || `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`}
            </button>
          ))}
        </details>
      )}
      <button
        onClick={async () => {
          setError("");
          try {
            await window.oarDesktop?.allowGeolocation();
            const p = await new Promise((resolve, reject) =>
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                timeout: 15000,
              }),
            );
            setDraft((d) => ({
              ...placeFromLocation({
                title: "Current location",
                lat: p.coords.latitude,
                lng: p.coords.longitude,
              }),
              color: d.color,
            }));
          } catch {
            setError(
              "Device location is unavailable. Search for your city or enter coordinates instead.",
            );
          }
        }}
      >
        <LocateFixed size={13} /> Use current location
      </button>
      <form onSubmit={save}>
        <div className="clock-color-row">
          <div className="clock-field-heading">
            <label htmlFor={colorId}>Clock color (foreground)</label>
            <Help label="About clock text colors">
              Custom text colors keep the theme background. A subtle contrasting
              outline helps readability across themes. Use theme color removes
              your custom color and follows the selected theme.
            </Help>
          </div>
          <input
            id={colorId}
            type="color"
            aria-label="Clock color"
            value={
              draft.color ||
              getComputedStyle(document.querySelector(".app"))
                .getPropertyValue("--text")
                .trim() ||
              "#29382b"
            }
            onChange={(e) => change("color", e.target.value)}
          />
          <button
            type="button"
            className="icon-button"
            aria-label="Use theme color"
            title="Use theme color"
            onClick={() => change("color", "")}
          >
            <RotateCcw size={15} />
          </button>
        </div>
        <label>
          Location name
          <input
            autoFocus
            required
            maxLength={120}
            value={draft.name}
            onChange={(e) => change("name", e.target.value)}
          />
        </label>
        <CityTimezonePicker
          value={draft.zone}
          onChange={(v) => change("zone", v)}
          onPlace={(p) =>
            setDraft((d) => ({ ...placeFromLocation(p), color: d.color }))
          }
        />
        <div className="clock-field-heading clock-coordinate-heading">
          <span>Coordinates (optional)</span>
          <Help label="About clock coordinates">
            Coordinates enable home weather. Initial home time uses your device
            timezone; no precise position is guessed. Weather sends selected
            coordinates to Open-Meteo. Leave both coordinates blank if unknown,
            or select an exact saved pin.
          </Help>
        </div>
        <div className="coordinate-fields">
          <label>
            Latitude (optional)
            <input
              type="number"
              min="-90"
              max="90"
              step="any"
              value={draft.lat ?? ""}
              onChange={(e) => change("lat", e.target.value)}
            />
          </label>
          <label>
            Longitude (optional)
            <input
              type="number"
              min="-180"
              max="180"
              step="any"
              value={draft.lng ?? ""}
              onChange={(e) => change("lng", e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save clock"}
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove().catch((e) => setError(e.message))}
            >
              <Trash2 size={14} /> Remove clock
            </button>
          )}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  );
}
