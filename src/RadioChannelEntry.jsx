import { useState } from "react";
import { CTCSS_TONES } from "../shared/radioProgramming.js";
import { manualChannel, parseChannelCsv } from "../shared/channelEntry.js";

export function ChannelForm({
  initial,
  onSave,
  onCancel,
  submitLabel = "Add channel to programming list",
}) {
  const [entry, setEntry] = useState(
    initial || {
      name: "",
      rxMHz: "",
      txMHz: "",
      receiveOnly: false,
      tone: "none",
      mode: "FM",
      notes: "",
    },
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const field = (key, value) =>
    setEntry((current) => ({ ...current, [key]: value }));
  return (
    <form
      className="radio-channel-form"
      aria-label="Manual radio channel"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          manualChannel(entry);
          await onSave(entry);
          setError("");
          if (!initial)
            setEntry({
              name: "",
              rxMHz: "",
              txMHz: "",
              receiveOnly: false,
              tone: "none",
              mode: "FM",
              notes: "",
            });
        } catch (reason) {
          setError(reason.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h4>{initial ? "Edit manual channel" : "Enter a radio channel"}</h4>
      <label>
        Radio memory name (1–7 characters)
        <input
          required
          maxLength={7}
          value={entry.name}
          onChange={(e) => field("name", e.target.value)}
        />
      </label>
      <label>
        Receive frequency (MHz)
        <input
          required
          type="number"
          step="0.00001"
          min="136"
          max="520"
          value={entry.rxMHz}
          onChange={(e) => field("rxMHz", e.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={entry.receiveOnly}
          onChange={(e) =>
            setEntry((current) => ({
              ...current,
              receiveOnly: e.target.checked,
              tone: e.target.checked ? "none" : current.tone,
            }))
          }
        />
        Receive only — disable transmitter in this memory
      </label>
      <label>
        Transmit frequency (MHz)
        <input
          required={!entry.receiveOnly}
          disabled={entry.receiveOnly}
          type="number"
          step="0.00001"
          min="136"
          max="520"
          value={entry.txMHz}
          onChange={(e) => field("txMHz", e.target.value)}
        />
      </label>
      {!entry.receiveOnly && (
        <button type="button" onClick={() => field("txMHz", entry.rxMHz)}>
          Use receive frequency for simplex TX
        </button>
      )}
      <label>
        Transmit CTCSS tone
        <select
          disabled={entry.receiveOnly}
          value={entry.tone}
          onChange={(e) => field("tone", e.target.value)}
        >
          <option value="none">No transmit tone</option>
          {CTCSS_TONES.map((tone) => (
            <option key={tone} value={tone.toFixed(1)}>
              {tone.toFixed(1)} Hz
            </option>
          ))}
        </select>
      </label>
      <label>
        Analog mode
        <select
          value={entry.mode}
          onChange={(e) => field("mode", e.target.value)}
        >
          <option>FM</option>
          <option>NFM</option>
        </select>
      </label>
      <label>
        Notes / source
        <input
          maxLength={200}
          value={entry.notes}
          onChange={(e) => field("notes", e.target.value)}
        />
      </label>
      <p>
        Saving does not verify or write a channel. Independently check
        frequencies, access settings and your licence; then mark it verified.
      </p>
      <button disabled={busy} type="submit">
        {submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          Cancel edit
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export default function RadioChannelEntry({ onSave }) {
  const [text, setText] = useState(""),
    [preview, setPreview] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details className="radio-channel-entry">
      <summary>Enter channels manually or import a channel list</summary>
      <ChannelForm onSave={(entry) => onSave([entry])} />
      <h4>Capture multiple channels</h4>
      <p>
        Paste or load UTF-8 CSV: Name,RX MHz,TX MHz or off,Tone,Mode,Notes.
        Optional header; quoted fields supported. Use <b>off</b> for
        receive-only and <b>none</b> for no transmit tone. This is AROAC entry
        CSV, not a CHIRP image.
      </p>
      <input
        type="file"
        accept=".csv,text/csv,text/plain"
        aria-label="Load channel entry CSV"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (file.size > 100000) {
            setError("CSV file exceeds 100 KB.");
            return;
          }
          setText(await file.text());
          setPreview(null);
          setError("");
        }}
      />
      <textarea
        aria-label="Channel entry CSV"
        rows={7}
        value={text}
        placeholder={
          "Name,RX MHz,TX MHz,Tone,Mode,Notes\nVE3RAD,146.94000,146.34000,100.0,FM,Verify with owner\nRXONLY,146.52000,off,none,NFM,Receive only"
        }
        onChange={(event) => {
          setText(event.target.value);
          setPreview(null);
        }}
      />
      <button
        disabled={busy}
        onClick={() => {
          try {
            setPreview(parseChannelCsv(text));
            setError("");
          } catch (reason) {
            setError(reason.message);
            setPreview(null);
          }
        }}
      >
        Validate and preview channel list
      </button>
      {preview && (
        <>
          <p>
            {preview.length} valid channel entries; all will be saved
            unverified.
          </p>
          <ol>
            {preview.map((row, i) => (
              <li key={i}>
                {row.name} · RX {row.rxMHz} · TX{" "}
                {row.receiveOnly ? "disabled" : row.txMHz} · {row.tone} ·{" "}
                {row.mode}
              </li>
            ))}
          </ol>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(preview);
                setPreview(null);
                setText("");
                setError("");
              } catch (reason) {
                setError(reason.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save {preview.length} channels to private programming list
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
