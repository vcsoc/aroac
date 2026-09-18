import { useEffect, useState } from "react";
export default function AppearanceSettings({ value, onSave, onPreview }) {
  const [scale, setScale] = useState(value.fontScale),
    [zoom, setZoom] = useState(1),
    [status, setStatus] = useState("");
  useEffect(() => {
    onPreview(scale);
  }, [scale, onPreview]);
  useEffect(() => () => onPreview(null), [onPreview]);
  useEffect(() => {
    if (!window.oarDesktop) return;
    window.oarDesktop
      .zoom()
      .then((r) => setZoom(r.zoomFactor))
      .catch((e) => setStatus(e.message));
    return window.oarDesktop.onZoomChanged(setZoom);
  }, []);
  const setAppZoom = async (next) => {
    try {
      const r = await window.oarDesktop.zoom(next);
      setZoom(r.zoomFactor);
    } catch (e) {
      setStatus(e.message);
    }
  };
  return (
    <section className="appearance-settings">
      <h3>Text & app zoom</h3>
      <label>
        Text size · {Math.round(scale * 100)}%
        <input
          type="range"
          min=".9"
          max="1.6"
          step=".01"
          aria-label="Interface text size"
          value={scale}
          onChange={(e) => {
            setScale(Number(e.target.value));
            setStatus("Preview — apply to keep this text size.");
          }}
        />
      </label>
      <div className="button-row">
        <button
          onClick={async () => {
            try {
              await onSave({ fontScale: scale });
              setStatus("Text size saved.");
            } catch (e) {
              setStatus(e.message);
            }
          }}
        >
          Apply text size
        </button>
        <button onClick={() => setScale(1.12)}>Default (112%)</button>
      </div>
      <small>
        Preview changes text, not the map’s geographic scale. Leaving this tab
        or closing Settings without applying reverts the preview.
      </small>
      {window.oarDesktop && (
        <>
          <label>
            App zoom · {Math.round(zoom * 100)}%
            <input
              type="range"
              min=".6"
              max="2"
              step=".1"
              aria-label="App zoom"
              value={zoom}
              onChange={(e) => setAppZoom(Number(e.target.value))}
            />
          </label>
          <div className="button-row">
            <button
              aria-label="Zoom app out"
              onClick={() => setAppZoom(zoom - 0.1)}
            >
              −
            </button>
            <button onClick={() => setAppZoom(1)}>Reset app zoom</button>
            <button
              aria-label="Zoom app in"
              onClick={() => setAppZoom(zoom + 0.1)}
            >
              +
            </button>
          </div>
          <small>
            Ctrl+ / Ctrl− zoom the whole interface. Ctrl+0 resets zoom. Saved
            automatically.
          </small>
        </>
      )}
      {status && <p role="status">{status}</p>}
    </section>
  );
}
