import { useEffect, useMemo, useRef, useState } from "react";
import { api, post } from "./lib";
import { documentFile } from "./workspaceState";
import { isCardNavigationClick } from "./contactLocation";
import { Pencil, Undo2, Download, Upload, CircleHelp } from "lucide-react";
import SavedItemList, {
  prepareItems,
  ItemTitle,
  CollapseButton,
} from "./SavedItemUI";
import ContactContext from "./ContactContext";
export function LibraryTransfer({ onImported, children }) {
  const [status, setStatus] = useState(""),
    [pending, setPending] = useState(null),
    [include, setInclude] = useState(false),
    [busy, setBusy] = useState(false);
  const run = async (fn) => {
    setBusy(true);
    setStatus("");
    try {
      await fn();
    } catch (e) {
      setStatus(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="library-transfer">
      <div className="button-row library-tabs">
        {children}
        <button
          className="icon-button"
          aria-label="Export locations / contacts"
          title="Export locations / contacts"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const data = await api("/library/export");
              const result = await documentFile(
                "save",
                "locations",
                JSON.stringify(data, null, 2),
              );
              setStatus(
                result.canceled
                  ? "Export canceled."
                  : "Locations and contacts exported.",
              );
            })
          }
        >
          <Download size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="Import"
          title="Import locations / contacts"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const file = await documentFile("open", "locations");
              if (file.canceled) return;
              const data = JSON.parse(file.text),
                preview = await post("/library/preview", { data });
              setPending({ data, ...preview });
              setInclude(false);
            })
          }
        >
          <Upload size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="About locations and contacts transfer"
          title="JSON file: device-wide saved locations/address book and, when signed in, your logbook contacts. No passwords or sessions. Imported records merge; exact duplicates are skipped."
        >
          <CircleHelp size={16} />
        </button>
      </div>
      {pending && (
        <div className="import-preview">
          <b>Import preview</b>
          <p>
            {pending.counts.pins} locations · {pending.counts.contacts}{" "}
            address-book contacts · {pending.counts.qsos} logbook contacts
          </p>
          {!!pending.counts.qsos && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={include}
                disabled={!pending.canImportLogbook}
                onChange={(e) => setInclude(e.target.checked)}
              />
              Include logbook contacts
              {!pending.canImportLogbook ? " (sign in first)" : ""}
            </label>
          )}
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const result = await post("/library/import", {
                  data: pending.data,
                  includeLogbook: include,
                });
                setPending(null);
                await onImported?.();
                setStatus(
                  `Imported ${result.imported.pins} locations, ${result.imported.contacts} contacts, ${result.imported.qsos} QSOs. Skipped ${Object.values(result.skipped).reduce((a, b) => a + b, 0)} duplicate or excluded records.`,
                );
              })
            }
          >
            Confirm merge import
          </button>
          <button onClick={() => setPending(null)}>Cancel import</button>
        </div>
      )}
      {status && <p role="status">{status}</p>}
    </section>
  );
}
export default function LibraryContacts({
  revision = 0,
  hoveredPin,
  onFocus,
  pins = [],
  home,
  activeId,
  focusRequest,
}) {
  const [rows, setRows] = useState([]),
    [error, setError] = useState(""),
    [adding, setAdding] = useState(false);
  const items = useMemo(
    () => prepareItems(rows, "contacts", pins),
    [rows, pins],
  );
  const load = () => api("/address-book").then(setRows);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [revision]);
  return (
    <section>
      <p className="drawer-help">
        Device-wide address book. These contacts do not create operator accounts
        or send messages.
      </p>
      <button onClick={() => setAdding(true)}>Add contact</button>
      {error && <p role="alert">{error}</p>}
      {adding && (
        <ContactEditor
          value={{ name: "", callsign: "", email: "", grid: "", notes: "" }}
          onSave={async (value) => {
            await post("/address-book", value);
            setAdding(false);
            await load();
          }}
          onDelete={() => setAdding(false)}
        />
      )}{" "}
      <SavedItemList
        items={items}
        kind="contacts"
        hoveredPin={hoveredPin}
        activeId={activeId}
        focusRequest={focusRequest}
      >
        {({ item: row, collapsed, onToggle }) => (
          <ContactEditor
            home={home}
            collapsed={collapsed}
            onToggle={onToggle}
            selected={activeId === row.id}
            hovered={
              hoveredPin &&
              row.place?.lat === hoveredPin.lat &&
              row.place?.lng === hoveredPin.lng
            }
            key={row.id}
            value={row}
            onFocus={onFocus}
            onSave={async (value) => {
              await api("/address-book/" + row.id, {
                method: "PUT",
                body: JSON.stringify(value),
              });
              await load();
            }}
            onDelete={async () => {
              if (confirm("Delete this address-book contact?")) {
                await api("/address-book/" + row.id, { method: "DELETE" });
                await load();
              }
            }}
          />
        )}
      </SavedItemList>
    </section>
  );
}
function ContactEditor({
  value,
  onSave,
  onDelete,
  onFocus,
  collapsed = false,
  onToggle,
  home,
  selected,
  hovered,
}) {
  const host = useRef();
  useEffect(() => {
    if (selected) host.current?.scrollIntoView({ block: "nearest" });
  }, [selected, collapsed]);
  const [editing, setEditing] = useState(!value.id);
  const [draft, setDraft] = useState(value),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const navigate = () => {
    try {
      onFocus?.(value);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <form
      ref={host}
      className={
        "pin-editor " +
        (selected ? "selected " : "") +
        (hovered ? "pin-hovered" : "")
      }
      data-contact-id={value.id}
      onClick={(e) => {
        if (value.id && isCardNavigationClick(e)) navigate();
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSave(draft);
          if (value.id) setEditing(false);
          setError("Saved.");
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {value.id ? (
        <div className="pin-editor-title">
          <ItemTitle
            label={"Go to contact " + (value.name || value.callsign)}
            onFocus={navigate}
            onToggle={onToggle}
          >
            {value.name || value.callsign}
            {value.name && value.callsign ? " · " + value.callsign : ""}
          </ItemTitle>
          <CollapseButton
            label={"contact " + (value.name || value.callsign)}
            collapsed={collapsed}
            onToggle={onToggle}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={
              (editing ? "Cancel editing " : "Edit ") +
              "contact " +
              (value.name || value.callsign)
            }
            title={editing ? "Cancel editing" : "Edit contact"}
            onClick={() => {
              setEditing(!editing);
              setDraft(value);
              setError("");
              if (collapsed) onToggle();
            }}
          >
            {editing ? <Undo2 size={14} /> : <Pencil size={14} />}
          </button>
        </div>
      ) : (
        <b>New contact</b>
      )}
      {!collapsed && (
        <>
          {!editing ? (
            <>
              <small>
                {[value.callsign, value.grid, value.email]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
              {value.notes && <p className="saved-notes">{value.notes}</p>}
              <ContactContext
                place={value.place}
                error={value.locationError}
                home={home}
              />
            </>
          ) : (
            <>
              {["name", "callsign", "email", "grid", "notes"].map((key) => (
                <label key={key}>
                  {key}
                  <input
                    aria-label={`${key} for contact ${value.id || "new"}`}
                    type={key === "email" ? "email" : "text"}
                    maxLength={
                      key === "notes"
                        ? 2000
                        : key === "grid"
                          ? 6
                          : key === "callsign"
                            ? 32
                            : key === "email"
                              ? 254
                              : 120
                    }
                    value={draft[key]}
                    onChange={(e) =>
                      setDraft((v) => ({ ...v, [key]: e.target.value }))
                    }
                  />
                </label>
              ))}
              <div className="button-row">
                <button type="submit" disabled={busy}>
                  Save contact
                </button>
                <button
                  type="button"
                  onClick={() =>
                    Promise.resolve(onDelete()).catch((e) =>
                      setError(e.message),
                    )
                  }
                >
                  {value.id ? "Delete contact" : "Cancel"}
                </button>
              </div>
            </>
          )}
        </>
      )}
      {error && <p role="status">{error}</p>}
    </form>
  );
}
