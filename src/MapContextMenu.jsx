import { useEffect, useRef, useState } from "react";
export default function MapContextMenu({
  context,
  source,
  onSource,
  onAddClock,
  onDestination,
  onClose,
  onSave,
  onEdit,
  onMove,
  onDelete,
  onFocus,
}) {
  const host = useRef(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const outside = (e) => {
      if (!host.current?.contains(e.target)) onClose();
    };
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key, true);
    host.current?.querySelector("button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key, true);
    };
  }, [onClose]);
  const action = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const { pin, lat, lng } = context;
  const left = Math.max(4, Math.min(context.x, window.innerWidth - 242)),
    top = Math.max(4, Math.min(context.y, window.innerHeight - 410));
  return (
    <div
      ref={host}
      className="map-context-menu"
      role="menu"
      aria-label={pin ? "Saved location actions" : "Map location actions"}
      style={{
        left,
        top,
        maxHeight: Math.max(40, window.innerHeight - top - 8),
        overflowY: "auto",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <strong>{pin?.callsign || pin?.label || "Map location"}</strong>
      <small>
        {lat.toFixed(5)}°, {lng.toFixed(5)}°
      </small>
      <button
        role="menuitem"
        disabled={busy}
        onClick={() => action(() => onSource({ lat, lng }))}
      >
        Set as source location
      </button>
      <button
        role="menuitem"
        disabled={busy || !source}
        title={
          source
            ? "Analyse source to this point"
            : "Set a source location first"
        }
        onClick={() => action(() => onDestination({ lat, lng }))}
      >
        Analyse link from source
      </button>
      <button
        role="menuitem"
        disabled={busy}
        onClick={() => action(() => onAddClock({ ...pin, lat, lng }))}
      >
        Add location as clock
      </button>
      {pin ? (
        <>
          <button
            role="menuitem"
            disabled={busy}
            onClick={() => action(() => onEdit(pin))}
          >
            Edit name, callsign & notes
          </button>
          <button
            role="menuitem"
            disabled={busy}
            onClick={() => action(() => onMove(pin))}
          >
            Move pin to another location
          </button>
          <button
            role="menuitem"
            disabled={busy}
            onClick={() => action(() => onFocus(pin))}
          >
            Center on pin
          </button>
          <button
            role="menuitem"
            disabled={busy}
            onClick={() => action(() => onDelete(pin))}
          >
            Delete pin
          </button>
        </>
      ) : (
        <button
          role="menuitem"
          disabled={busy}
          onClick={() => action(() => onSave({ lat, lng }))}
        >
          Save pin here
        </button>
      )}
      <button
        role="menuitem"
        disabled={busy}
        onClick={() =>
          action(() =>
            window.oarDesktop
              ? window.oarDesktop.copyCoordinates(lat, lng)
              : navigator.clipboard.writeText(
                  `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
                ),
          )
        }
      >
        Copy coordinates
      </button>
      <button role="menuitem" onClick={onClose}>
        Close menu
      </button>
      {error && (
        <small role="alert" className="field-error">
          {error}
        </small>
      )}
    </div>
  );
}
