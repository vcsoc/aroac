import { useEffect, useState } from "react";
import { parseDocument, stringify } from "yaml";
import { defaultTheme, validateTheme } from "../shared/workspace";
import { documentFile } from "./workspaceState";
export const themeStyle = (theme) =>
  Object.fromEntries(
    Object.entries(theme.colors).map(([key, value]) => [
      "--" + key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()),
      value,
    ]),
  );
export default function ThemeEditor({ value, onSave, onPreview }) {
  const [draft, setDraft] = useState(value),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      onPreview(validateTheme(draft));
    } catch {}
  }, [draft, onPreview]);
  useEffect(() => () => onPreview(null), [onPreview]);
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
    <section className="theme-editor">
      <h3>Theme editor</h3>
      <p>
        Live preview across OAR. Apply to save; leaving this tab or closing
        Settings discards unapplied changes. Provider imagery/websites keep
        their own colors.
      </p>
      <label>
        Theme name
        <input
          maxLength={80}
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
      </label>
      <div
        className="theme-preview"
        aria-label="Theme preview"
        style={themeStyle(draft)}
      >
        <header>
          OAR · Preview <b>● ON AIR</b>
        </header>
        <div>
          <aside>
            Atlas
            <br />
            Conditions
            <br />
            Contacts
          </aside>
          <article>
            <small>HOME LOCATION TIME</small>
            <strong>12:34:56</strong>
            <p>
              Readable text · <span>muted information</span>
            </p>
            <button className="primary">Primary action</button>
            <button>Secondary</button>
            <input
              readOnly
              aria-label="Preview input"
              value="Callsign / location"
            />
            <p>
              <i className="preview-pin">● Saved pin</i>{" "}
              <i className="preview-repeater">● Repeater</i>
            </p>
            <p className="form-error">Example alert</p>
          </article>
        </div>
      </div>
      <div className="theme-colors">
        {Object.keys(defaultTheme.colors).map((key) => (
          <label key={key}>
            {key.replace(/[A-Z]/g, (c) => " " + c.toLowerCase())}
            <input
              type="color"
              aria-label={key + " color picker"}
              value={
                /^#[a-f0-9]{6}$/i.test(draft.colors[key])
                  ? draft.colors[key]
                  : "#000000"
              }
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  colors: { ...d.colors, [key]: e.target.value },
                }))
              }
            />
            <input
              aria-label={key + " hex color"}
              maxLength={7}
              value={draft.colors[key]}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  colors: { ...d.colors, [key]: e.target.value },
                }))
              }
            />
          </label>
        ))}
      </div>
      <div className="button-row">
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const valid = validateTheme(draft);
              await onSave(valid);
              setStatus("Theme saved.");
            })
          }
        >
          Apply theme
        </button>
        <button disabled={busy} onClick={() => setDraft(value)}>
          Revert
        </button>
        <button disabled={busy} onClick={() => setDraft(defaultTheme)}>
          Default
        </button>
      </div>
      <div className="button-row">
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              const file = await documentFile("open", "theme");
              if (file.canceled) return;
              const doc = parseDocument(file.text, { uniqueKeys: true });
              if (doc.errors.length || doc.warnings.length)
                throw Error(
                  "Invalid YAML: " + (doc.errors[0] || doc.warnings[0]).message,
                );
              setDraft(validateTheme(doc.toJS({ maxAliasCount: 0 })));
              setStatus("Imported into preview. Apply to save.");
            })
          }
        >
          Import YAML
        </button>
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              const result = await documentFile(
                "save",
                "theme",
                stringify(validateTheme(draft)),
              );
              setStatus(
                result.canceled ? "Export canceled." : "Theme exported.",
              );
            })
          }
        >
          Export YAML
        </button>
      </div>
      {status && <p role="status">{status}</p>}
    </section>
  );
}
