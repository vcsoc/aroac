import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  MapPin,
  Trash2,
  Save,
  RefreshCw,
  Radio,
  Pin,
  PinOff,
  Pencil,
  Home,
  Move,
  Undo2,
  Eclipse,
  CloudRain,
  Activity,
  Globe2,
  Signpost,
  Building2,
  Clock,
  Radar,
} from "lucide-react";
import { isCardNavigationClick } from "./contactLocation";
import { withTimezone } from "./locations";
import { PanelResizer, PanelScrollArea } from "./PanelLayout";
import SavedItemList, {
  prepareItems,
  ItemTitle,
  CollapseButton,
} from "./SavedItemUI";
import ContactContext from "./ContactContext.jsx";
import { Help } from "./InterfaceUI";
import { useToastStatus } from "./Toasts";
import OnOffTrack from "./OnOffTrack";
import { repeaterFootprint } from "../shared/coverage.js";
const toggleIcons = {
  "Saved locations on map": MapPin,
  "Grey line": Eclipse,
  Radar: CloudRain,
  MUF: Activity,
  "Show time zones": Globe2,
  "Show street names": Signpost,
  "Show city names": Building2,
  "Show repeaters": Radio,
  "Grey line follows clock slider": Clock,
  "Estimated range": Radar,
};
export function Switch({
  label,
  value,
  onChange,
  description,
  fullRow = false,
  iconOnly = false,
}) {
  if (iconOnly) {
    const Icon = toggleIcons[label] || Radio;
    return (
      <button
        type="button"
        className="map-icon-toggle"
        aria-label={label}
        aria-pressed={value}
        aria-description={description}
        title={`${label}: ${description}`}
        onClick={() => onChange(!value)}
      >
        <Icon size={16} aria-hidden="true" />
      </button>
    );
  }
  if (fullRow)
    return (
      <div className="switch-help-row">
        <button
          type="button"
          className="drawer-setting row-toggle"
          role="switch"
          aria-label={label}
          aria-description={description}
          title={description}
          aria-checked={value}
          onClick={() => onChange(!value)}
        >
          <strong>{label}</strong>
          <OnOffTrack />
        </button>
        {description && <Help label={"About " + label}>{description}</Help>}
      </div>
    );
  return (
    <div className="drawer-setting">
      <div>
        <strong>{label}</strong>
        {description && <Help label={"About " + label}>{description}</Help>}
      </div>
      <button
        className="toggle-switch"
        type="button"
        role="switch"
        aria-label={label}
        title={description}
        aria-description={description}
        aria-checked={value}
        onClick={() => onChange(!value)}
      >
        <OnOffTrack />
      </button>
    </div>
  );
}
export function MapDrawer({
  kind,
  onClose,
  children,
  pinned,
  setPinned,
  resize,
}) {
  const host = useRef(),
    callback = useRef(onClose);
  callback.current = onClose;
  useEffect(() => {
    if (!kind) return;
    const key = (e) => {
      if (
        e.key === "Escape" &&
        !e.defaultPrevented &&
        !document.querySelector("dialog[open],[popover]:popover-open")
      ) {
        e.preventDefault();
        callback.current();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [kind]);
  return (
    <aside
      id="map-drawer"
      ref={host}
      className={"map-drawer " + (kind ? "open" : "")}
      aria-hidden={!kind}
      inert={!kind}
      aria-label={
        kind === "settings"
          ? "Map settings"
          : kind === "pins"
            ? "Saved locations"
            : kind === "link"
              ? "Link planning"
              : "Repeater details"
      }
    >
      <div className="drawer-heading">
        <h2>
          {kind === "settings"
            ? "Settings"
            : kind === "pins"
              ? "Saved locations"
              : kind === "link"
                ? "Link planning"
                : "Repeater details"}
        </h2>
        <button
          className="icon-button"
          aria-label="Pin right panel"
          aria-pressed={!!pinned}
          onClick={() => setPinned?.(!pinned)}
        >
          {pinned ? <PinOff size={16} /> : <Pin size={16} />}
        </button>
        <button
          className="icon-button"
          aria-label="Close side panel"
          disabled={pinned}
          title={pinned ? "Unpin to close" : "Close"}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <PanelScrollArea>{kind && children}</PanelScrollArea>
      {resize && <PanelResizer {...resize} />}
    </aside>
  );
}
export function MapSettings({
  zones,
  setZones,
  streets,
  setStreets,
  cities,
  setCities,
  showRepeaters,
  setRepeaters,
  directory,
  iconOnly = false,
}) {
  return (
    <>
      <Switch
        fullRow
        iconOnly={iconOnly}
        label="Show time zones"
        value={zones}
        onChange={setZones}
        description="Nominal 15° time meridians and UTC labels. Select a point for its actual civil timezone."
      />
      <Switch
        fullRow
        iconOnly={iconOnly}
        label="Show street names"
        value={streets}
        onChange={setStreets}
        description="High-contrast labels over the imagery. Zoom to city/street level; requires OpenFreeMap/OSM tiles."
      />
      <Switch
        fullRow
        iconOnly={iconOnly}
        label="Show city names"
        value={cities}
        onChange={setCities}
        description="OpenFreeMap/OSM city labels become more detailed as you zoom in. Searched places stay labelled until you clear the search."
      />
      <Switch
        fullRow
        iconOnly={iconOnly}
        label="Show repeaters"
        value={showRepeaters}
        onChange={setRepeaters}
        description="All geolocated records available from hearham.com. Markers cluster when zoomed out."
      />
      {showRepeaters && !iconOnly && (
        <div className="directory-status">
          <p role="status">
            {directory.loading
              ? "Downloading repeater directory…"
              : directory.error ||
                `${directory.value?.repeaters.length.toLocaleString() || 0} geolocated repeaters`}
          </p>
          {directory.value && (
            <>
              <small>
                {directory.value.stale
                  ? "Saved data · may be outdated"
                  : "Directory cache"}{" "}
                · {new Date(directory.value.fetchedAt).toLocaleString()}
              </small>
              <small>
                {directory.value.omitted} records without usable
                location/frequency omitted. Directory coverage is not
                exhaustive; verify details before transmitting.
              </small>
            </>
          )}
          <button onClick={directory.refresh} disabled={directory.loading}>
            <RefreshCw size={14} />
            Refresh directory
          </button>
          <a href="https://hearham.com" target="_blank" rel="noreferrer">
            Source: hearham.com ↗
          </a>
        </div>
      )}
    </>
  );
}
function PinEditor({
  collapsed,
  hovered,
  onToggle,
  home,
  editRequested,
  onEditHandled,
  pin,
  selected,
  onUpdate,
  onFocus,
  onDelete,
  onMove,
  onHome,
}) {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (editRequested) {
      setEditing(true);
      if (collapsed) onToggle();
      onEditHandled?.();
    }
  }, [editRequested]);
  const [draft, setDraft] = useState({}),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useToastStatus();
  const host = useRef();
  useEffect(() => {
    if (selected) host.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const change = (name, value) => {
    setDraft((prev) => ({ ...prev, [name]: value }));
    setStatus("");
  };
  const location = withTimezone(pin);
  return (
    <form
      ref={host}
      className={
        "pin-editor " +
        (selected ? "selected " : "") +
        (hovered ? "pin-hovered" : "")
      }
      data-pin-id={pin.id}
      onClick={(e) => {
        if (isCardNavigationClick(e)) onFocus(pin);
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const patch = { ...draft };
          for (const key of ["lat", "lng"])
            if (key in patch) {
              if (String(patch[key]).trim() === "")
                throw Error("Coordinates cannot be blank");
              patch[key] = Number(patch[key]);
            }
          const saved = await onUpdate(pin.id, patch);
          setDraft({});
          setEditing(false);
          setStatus(
            saved?.copiedFromGeneral
              ? "Saved a private copy. The General original is unchanged."
              : `Updated saved location “${patch.label || pin.label}” on this device. ${Object.keys(patch).some((k) => k === "lat" || k === "lng") ? "Its map position has been updated." : "Your location details have been saved."}`,
          );
        } catch (error) {
          setStatus(error.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="pin-editor-title">
        <MapPin size={16} />
        <ItemTitle
          label={"Go to saved location " + pin.label}
          onFocus={() => onFocus(pin)}
          onToggle={onToggle}
        >
          {pin.callsign
            ? `${pin.callsign} · ${pin.name || pin.label}`
            : pin.name || pin.label}
        </ItemTitle>
        <CollapseButton
          label={"saved location " + pin.label}
          collapsed={collapsed}
          onToggle={onToggle}
        />
        <button
          type="button"
          className="icon-button"
          aria-label={
            (editing ? "Cancel editing " : "Edit ") +
            "saved location " +
            pin.label
          }
          title={editing ? "Cancel editing" : "Edit saved location"}
          onClick={() => {
            setEditing(!editing);
            setDraft({});
            setStatus("");
            if (collapsed) onToggle();
          }}
        >
          {editing ? <Undo2 size={14} /> : <Pencil size={14} />}
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={"Show saved location " + pin.label}
          onClick={() => onFocus(pin)}
        >
          ↗
        </button>
      </div>
      {!collapsed && (
        <>
          {!editing ? (
            <>
              <strong>{pin.label}</strong>
              {pin.name && <small>Contact: {pin.name}</small>}
              {pin.notes && <p className="saved-notes">{pin.notes}</p>}
              <ContactContext place={location} home={home} />
            </>
          ) : (
            <>
              <label>
                Contact name (optional)
                <input
                  aria-label={"Contact name for saved location " + pin.id}
                  maxLength={120}
                  value={draft.name ?? pin.name ?? ""}
                  onChange={(e) => change("name", e.target.value)}
                />
              </label>
              <label>
                Name
                <input
                  aria-label={"Name for saved location " + pin.id}
                  maxLength={120}
                  required
                  value={draft.label ?? pin.label}
                  onChange={(e) => change("label", e.target.value)}
                />
              </label>
              <label>
                Callsign (optional)
                <input
                  aria-label={"Callsign for saved location " + pin.id}
                  maxLength={32}
                  value={draft.callsign ?? pin.callsign}
                  onChange={(e) => change("callsign", e.target.value)}
                />
              </label>
              <div className="coordinate-fields">
                <label>
                  Latitude
                  <input
                    type="number"
                    required
                    step="any"
                    min="-90"
                    max="90"
                    aria-label={"Latitude for saved location " + pin.id}
                    value={draft.lat ?? pin.lat}
                    onChange={(e) => change("lat", e.target.value)}
                  />
                </label>
                <label>
                  Longitude
                  <input
                    type="number"
                    required
                    step="any"
                    min="-180"
                    max="180"
                    aria-label={"Longitude for saved location " + pin.id}
                    value={draft.lng ?? pin.lng}
                    onChange={(e) => change("lng", e.target.value)}
                  />
                </label>
              </div>
              <small>
                {location.grid.toUpperCase()} · {location.zone}
              </small>
              <label>
                Notes
                <textarea
                  rows={2}
                  maxLength={2000}
                  aria-label={"Notes for saved location " + pin.id}
                  value={draft.notes ?? pin.notes}
                  onChange={(e) => change("notes", e.target.value)}
                />
              </label>
            </>
          )}
          <div className="pin-actions">
            {editing && (
              <button
                className="primary icon-button"
                title="Save changes"
                aria-label="Save changes"
                disabled={busy || !Object.keys(draft).length}
              >
                <Save size={13} />
              </button>
            )}
            <button
              type="button"
              className="icon-button"
              aria-label="Move on map"
              title="Move on map"
              onClick={() => onMove(pin)}
            >
              <Move size={14} />
            </button>
            {
              <button
                type="button"
                className="icon-button"
                title="Delete saved location"
                aria-label={"Delete saved location " + pin.label}
                onClick={() => onDelete(pin)}
              >
                <Trash2 size={14} />
              </button>
            }
            {onHome && (
              <button
                type="button"
                className="icon-button"
                title="Use this pin as home location"
                aria-label="Use this pin as home location"
                onClick={() =>
                  onHome(pin).catch((e) =>
                    setStatus(`Could not change home location: ${e.message}`),
                  )
                }
              >
                <Home size={14} />
              </button>
            )}
          </div>
        </>
      )}
      {status && <small role="status">{status}</small>}
    </form>
  );
}
export function SavedPins({
  hoveredPin,
  home,
  editingPinId,
  onEditHandled,
  pins,
  error,
  activeId,
  onUpdate,
  onFocus,
  onDelete,
  onMove,
  onHome,
}) {
  const [query, setQuery] = useState("");
  const items = useMemo(() => prepareItems(pins, "pins"), [pins]);
  const shown = items.filter((p) =>
    (p.label + " " + (p.name || "") + " " + p.callsign + " " + p.notes)
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <span>
        {pins.length} saved locations{" "}
        <Help label="About saved locations">
          Locations are saved on this device. Right-click the map to add a pin.
          Drag any pin to move it, or use its Move button.
        </Help>
      </span>
      <input
        aria-label="Filter saved locations"
        placeholder="Filter names or callsigns…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <SavedItemList
        items={shown}
        kind="pins"
        activeId={activeId}
        hoveredPin={hoveredPin}
      >
        {({ item: pin, collapsed, onToggle }) => (
          <PinEditor
            home={home}
            hovered={hoveredPin?.id === pin.id}
            collapsed={collapsed}
            onToggle={onToggle}
            editRequested={editingPinId === pin.id}
            onEditHandled={onEditHandled}
            key={pin.id}
            pin={pin}
            selected={pin.id === activeId}
            onUpdate={onUpdate}
            onFocus={onFocus}
            onDelete={onDelete}
            onMove={onMove}
            onHome={onHome}
          />
        )}
      </SavedItemList>
      {!shown.length && (
        <p className="drawer-help">
          {pins.length
            ? "No matching saved locations."
            : "No saved locations yet."}
        </p>
      )}
    </>
  );
}
export function RepeaterDetails({
  repeater,
  rangeSettings,
  alternatives,
  onChoose,
  directory,
  onSave,
}) {
  const [status, setStatus] = useToastStatus(),
    [busy, setBusy] = useState(false);
  useEffect(() => setStatus(""), [repeater?.id]);
  if (!repeater)
    return <p className="drawer-help">Select a repeater on the map.</p>;
  const location = withTimezone(repeater);
  const footprint = repeaterFootprint(repeater, rangeSettings);
  return (
    <>
      <div className="repeater-heading">
        <Radio size={22} />
        <div>
          <h3>{repeater.callsign || "Unnamed repeater"}</h3>
          <p>{repeater.city || "Location not supplied"}</p>
        </div>
      </div>
      {alternatives.length > 1 && (
        <label>
          Repeaters at this point
          <select
            aria-label="Choose repeater at this location"
            value={repeater.id}
            onChange={(e) => onChoose(e.target.value)}
          >
            {alternatives.map((r) => (
              <option key={r.id} value={r.id}>
                {r.callsign || "Unnamed"} · {r.frequencyMHz.toFixed(4)} MHz ·{" "}
                {r.mode}
              </option>
            ))}
          </select>
        </label>
      )}
      <section
        className="directory-status"
        aria-label="Repeater range estimate"
      >
        <strong>
          {footprint
            ? `Estimated radius: ${footprint.radiusKm.toFixed(1)} km`
            : "Local range estimate unavailable for this frequency"}
        </strong>
        <p>
          Gold ring on the map when Estimated range and the repeater layer are
          enabled. Uses assumed site antenna height, power and receiver
          sensitivity from Range assumptions in the left panel’s Range tab—not
          measured coverage. Terrain, tones, mode, access and live status are
          not verified. Selecting a distant repeater does not imply it is
          reachable.
        </p>
        <a
          href="https://www.repeaterbook.com/"
          target="_blank"
          rel="noreferrer"
        >
          Cross-check details on RepeaterBook ↗
        </a>
        <p>
          RepeaterBook is not an active OAR data feed: approved application
          access and per-user tokens are required.
        </p>
      </section>
      <dl className="repeater-summary">
        <dt>Output</dt>
        <dd>{repeater.frequencyMHz.toFixed(4)} MHz</dd>
        <dt>Offset</dt>
        <dd>
          {repeater.offsetMHz === null
            ? "Not supplied"
            : `${repeater.offsetMHz >= 0 ? "+" : ""}${repeater.offsetMHz.toFixed(4)} MHz`}
        </dd>
        <dt>Input</dt>
        <dd>
          {repeater.offsetMHz === null
            ? "Not supplied"
            : (repeater.frequencyMHz + repeater.offsetMHz).toFixed(4) + " MHz"}
        </dd>
        <dt>Mode</dt>
        <dd>{repeater.mode || "Not supplied"}</dd>
        <dt>Grid</dt>
        <dd>{location.grid.toUpperCase()}</dd>
        <dt>Time zone</dt>
        <dd>{location.zone}</dd>
      </dl>
      <button
        className="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave({
              label: repeater.callsign || repeater.city || "Repeater",
              callsign: repeater.callsign.slice(0, 32),
              lat: repeater.lat,
              lng: repeater.lng,
              notes: `${repeater.frequencyMHz.toFixed(4)} MHz ${repeater.mode} · hearham.com`,
            });
          } catch (error) {
            setStatus(error.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <MapPin size={14} />
        Save location as pin
      </button>
      {status && <p role="alert">{status}</p>}
      <h3 className="raw-heading">All supplied directory details</h3>
      <dl className="repeater-raw">
        {Object.entries(repeater.raw).map(([key, value]) => (
          <div key={key}>
            <dt>{key.replaceAll("_", " ")}</dt>
            <dd>
              {value === null || value === ""
                ? "Not supplied"
                : typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="drawer-help">
        Source: hearham.com · downloaded{" "}
        {directory?.fetchedAt
          ? new Date(directory.fetchedAt).toLocaleString()
          : "unknown"}
        {directory?.stale ? " · cached / potentially outdated" : ""}. Directory
        reports are not a guarantee of operational status, coverage or
        permission to transmit.
      </p>
      <a href="https://hearham.com" target="_blank" rel="noreferrer">
        Open data provider ↗
      </a>
    </>
  );
}
