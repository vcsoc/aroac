import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api, post } from "./lib";
import { parseSources } from "../shared/sourceConfig";
import { toast } from "./Toasts";
import { Help } from "./InterfaceUI";
import ActionToast from "./ActionToast";
let snapshot = {},
  revision = null,
  listeners = new Set();
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const get = () => snapshot;
export const useSources = () => useSyncExternalStore(subscribe, get);
function publish(value) {
  if (
    revision !== value.revision ||
    JSON.stringify(snapshot) !== JSON.stringify(value.active)
  ) {
    revision = value.revision;
    snapshot = value.active;
    listeners.forEach((fn) => fn());
    window.dispatchEvent(new Event("oar-sources-changed"));
  }
}
export async function reloadSources() {
  const value = await api("/sources");
  publish(value);
  return value;
}
function Fault({ error, onIgnore, onReset }) {
  const [busy, setBusy] = useState(false);
  return (
    <ActionToast label="Source configuration error">
      <strong>Source configuration needs attention</strong>
      <p>{error}</p>
      <p>
        Your last valid configuration remains active. Reset config downloads the
        defaults from GitHub, with bundled defaults as an offline fallback.
      </p>
      <div className="button-row">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const value = await post("/sources/reset", {});
              publish(value);
              window.dispatchEvent(
                new CustomEvent("oar-sources-reset", { detail: value }),
              );
              toast(
                "Source configuration reset using " + value.restoredFrom + ".",
              );
              onReset?.(value);
              onIgnore();
            } catch (e) {
              toast(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Reset config
        </button>
        <button disabled={busy} onClick={onIgnore}>
          Ignore
        </button>
      </div>
    </ActionToast>
  );
}
export function SourceHost({ home }) {
  const [error, setError] = useState(""),
    seen = useRef("");
  useEffect(() => {
    let live = true;
    const load = () =>
      reloadSources()
        .then((v) => {
          if (!live) return;
          if (!v.error) {
            seen.current = "";
            setError("");
          } else {
            const key = v.error + v.text;
            if (key !== seen.current) {
              seen.current = key;
              setError(v.error);
            }
          }
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 15000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [home?.lat, home?.lng]);
  return error ? <Fault error={error} onIgnore={() => setError("")} /> : null;
}
export default function SourcesEditor() {
  const [text, setText] = useState(""),
    [path, setPath] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    reloadSources()
      .then((v) => {
        if (live) {
          setText(v.text);
          setPath(v.path);
          setReady(true);
        }
      })
      .catch((e) => toast("Could not load sources: " + e.message));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const reset = (e) => {
      setText(e.detail.text);
      setError("");
    };
    window.addEventListener("oar-sources-reset", reset);
    return () => window.removeEventListener("oar-sources-reset", reset);
  }, []);
  const save = async () => {
    setBusy(true);
    try {
      parseSources(text);
      const value = await api("/sources", {
        method: "PUT",
        body: JSON.stringify({ text }),
      });
      publish(value);
      setError("");
      toast(
        "Source configuration validated and applied. Maps and active data feeds are refreshing.",
      );
    } catch (e) {
      setError(
        "These config changes cause configuration exceptions: " +
          e.message +
          " The active configuration has not changed.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="sources-editor">
      <h3>
        Data sources{" "}
        <Help label="About sources">
          Global (*) entries cover every country. Add compatible country entries
          using ISO alpha-2 codes such as CA or ZA. Weather selects by requested
          coordinates; global feeds and map styles use the home country.
          Boundaries are approximate. Keep attribution and provider terms. YAML
          syntax and supported adapter formats are validated; arbitrary websites
          and unrelated API schemas cannot be ingested. Direct file edits are
          checked every 15 seconds. Never put private credentials in a source
          URL.
        </Help>
      </h3>
      <small>{path}</small>
      <label>
        Sources YAML
        <textarea
          aria-label="Sources YAML"
          spellCheck={false}
          disabled={!ready || busy}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="button-row">
        <button className="primary" disabled={!ready || busy} onClick={save}>
          Validate and apply sources
        </button>
        <button
          disabled={busy}
          onClick={() =>
            setError(
              "Reset replaces your edited configuration with the current published defaults.",
            )
          }
        >
          Reset config
        </button>
      </div>
      {error && (
        <Fault
          error={error}
          onIgnore={() => setError("")}
          onReset={(v) => setText(v.text)}
        />
      )}
    </section>
  );
}
