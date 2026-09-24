import { useEffect, useState } from "react";
import { Help } from "./InterfaceUI";
import { useToastStatus } from "./Toasts";
export default function AppearanceSettings({ value, onSave, onPreview }) {
  const [scale, setScale] = useState(value.fontScale),
    [small, setSmall] = useState(value.smallFontScale ?? 1),
    [zoom, setZoom] = useState(1),
    [status, setStatus] = useToastStatus();
  useEffect(() => {
    onPreview({ fontScale: scale, smallFontScale: small });
  }, [scale, small, onPreview]);
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
          }}
        />
      </label>
      <label>
        Small text size · {Math.round(small * 100)}%
        <input
          type="range"
          min=".9"
          max="1.8"
          step=".01"
          aria-label="Small interface text size"
          value={small}
          onChange={(e) => setSmall(Number(e.target.value))}
        />
      </label>
      <Help label="About small text size">
        Adjusts small AROAC labels, clock dates, status lines and panel details
        in addition to the main text-size setting. Map-provider labels and
        third-party pages retain their own sizing.
      </Help>
      <div className="button-row">
        <button
          onClick={async () => {
            try {
              await onSave({ fontScale: scale, smallFontScale: small });
              setStatus(
                `Interface text size saved at ${Math.round(scale * 100)}%.`,
              );
            } catch (e) {
              setStatus(e.message);
            }
          }}
        >
          Apply text size
        </button>
        <button
          onClick={() => {
            setScale(1.12);
            setSmall(1);
          }}
        >
          Default (112%)
        </button>
      </div>
      <Help label="About text size preview">
        Preview changes text, not the map’s geographic scale. Leaving this tab
        or closing Settings without applying reverts the preview.
      </Help>
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
          <Help label="About app zoom">
            Ctrl+ / Ctrl− zoom the whole interface. Ctrl+0 resets zoom. Saved
            automatically.
          </Help>
        </>
      )}
      {status && <p role="status">{status}</p>}
    </section>
  );
}
