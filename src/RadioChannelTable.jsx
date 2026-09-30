import { useState } from "react";
import { CTCSS_TONES, canExportChannel } from "../shared/radioProgramming.js";
import { manualChannel } from "../shared/channelEntry.js";
import { confirmAction } from "./InterfaceUI";

function EntryRow({
  row,
  memory,
  slot,
  residual,
  onSave,
  onRemove,
  onVerify,
  onProgram,
  canProgram,
  targetSlot,
}) {
  const s = row?.snapshot;
  const initial = {
    name: s?.callsign || memory?.name || "",
    rxMHz: s?.outputMHz ?? memory?.rxMHz ?? "",
    txMHz: s ? s.outputMHz + row.offsetMHz : (memory?.txMHz ?? ""),
    receiveOnly: !!(s?.receiveOnly || memory?.receiveOnly),
    tone: row
      ? row.toneMode === "tone"
        ? row.txTone
        : row.toneMode === "none"
          ? "none"
          : "unknown"
      : memory?.supportedForCapture
        ? memory.tone
        : memory
          ? "unknown"
          : "none",
    mode: s?.mode || memory?.mode || "FM",
    notes:
      s?.city ||
      (memory
        ? `Captured from radio memory ${slot}; verify independently`
        : ""),
  };
  const [editing, setEditing] = useState(false),
    [entry, setEntry] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const field = (key, value) =>
    setEntry((current) => ({ ...current, [key]: value }));
  const label =
    s?.callsign ||
    memory?.name ||
    `${residual ? "residual-data" : "empty"} memory ${slot}`;
  const save = async () => {
    setBusy(true);
    try {
      manualChannel(entry);
      await onSave(entry);
      setEditing(false);
      setError("");
      setSaved(true);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <tr
      className={editing ? "editing" : ""}
      aria-label={`Channel row ${label}`}
    >
      <td>{slot ?? "Draft"}</td>
      <td>
        {editing ? (
          <input
            aria-label={`Name for ${label}`}
            maxLength={7}
            value={entry.name}
            onChange={(e) => field("name", e.target.value)}
          />
        ) : (
          label
        )}
      </td>
      <td>
        {editing ? (
          <input
            aria-label={`RX MHz for ${label}`}
            type="number"
            step="0.00001"
            value={entry.rxMHz}
            onChange={(e) => field("rxMHz", e.target.value)}
          />
        ) : initial.rxMHz === "" ? (
          "—"
        ) : (
          Number(initial.rxMHz).toFixed(5)
        )}
      </td>
      <td>
        {editing ? (
          <>
            <input
              aria-label={`TX MHz for ${label}`}
              type="number"
              step="0.00001"
              disabled={entry.receiveOnly}
              value={entry.txMHz}
              onChange={(e) => field("txMHz", e.target.value)}
            />
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
              />{" "}
              RX only
            </label>
          </>
        ) : initial.receiveOnly ? (
          "Disabled"
        ) : initial.txMHz === "" ? (
          "—"
        ) : (
          Number(initial.txMHz).toFixed(5)
        )}
      </td>
      <td>
        {editing ? (
          <select
            aria-label={`Tone for ${label}`}
            disabled={entry.receiveOnly}
            value={entry.tone}
            onChange={(e) => field("tone", e.target.value)}
          >
            <option value="unknown">Choose / unverified</option>
            <option value="none">None</option>
            {CTCSS_TONES.map((tone) => (
              <option key={tone} value={tone.toFixed(1)}>
                {tone.toFixed(1)}
              </option>
            ))}
          </select>
        ) : memory || row ? (
          initial.tone
        ) : (
          "—"
        )}
      </td>
      <td>
        {editing ? (
          <select
            aria-label={`Mode for ${label}`}
            value={entry.mode}
            onChange={(e) => field("mode", e.target.value)}
          >
            <option>FM</option>
            <option>NFM</option>
          </select>
        ) : row || memory ? (
          initial.mode
        ) : (
          "—"
        )}
      </td>
      <td>
        {editing ? (
          <input
            aria-label={`Notes for ${label}`}
            maxLength={200}
            value={entry.notes}
            onChange={(e) => field("notes", e.target.value)}
          />
        ) : (
          s?.city || memory?.warning || "Empty"
        )}
      </td>
      <td>
        {row
          ? row.verified
            ? "Verified locally"
            : "Draft / verify"
          : memory
            ? "Extracted, read-only"
            : residual
              ? "Residual bytes; not writable"
              : "Empty on radio"}
      </td>
      <td className="radio-table-actions">
        {editing ? (
          <>
            <button disabled={busy} onClick={save}>
              Save draft
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError("");
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                setEntry(initial);
                setEditing(true);
              }}
            >
              {row
                ? "Edit inline"
                : memory
                  ? "Edit / capture draft"
                  : "Enter channel"}
            </button>
            {row && (
              <>
                <button
                  disabled={busy || row.verified}
                  onClick={async () => {
                    if (
                      !(await confirmAction(
                        "Confirm you independently checked this channel’s RX/TX or receive-only setting, tone, analog mode and applicable licence/access rules. Verification does not write the radio.",
                      ))
                    )
                      return;
                    setBusy(true);
                    try {
                      await onVerify();
                      setError("");
                    } catch (reason) {
                      setError(reason.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {row.verified ? "Verified" : "Verify settings"}
                </button>
                <button disabled={busy} onClick={onRemove}>
                  Remove draft
                </button>
                {window.oarDesktop?.programUV5R && canExportChannel(row) && (
                  <button disabled={!canProgram} onClick={onProgram}>
                    Program to memory {targetSlot}
                  </button>
                )}
              </>
            )}
          </>
        )}
        {saved && !row && (
          <p role="status">
            Local draft saved in the programming list; radio unchanged.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </td>
    </tr>
  );
}
const headings = [
  "Memory",
  "Name",
  "RX MHz",
  "TX MHz",
  "TX CTCSS",
  "Mode",
  "Notes / source",
  "Status",
  "Actions",
];
function Table({ title, children }) {
  return (
    <div className="radio-table-scroll">
      <table aria-label={title} className="radio-channel-table">
        <thead>
          <tr>
            {headings.map((heading) => (
              <th scope="col" key={heading}>
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export default function RadioChannelTable({
  rows,
  inspection,
  onUpdate,
  onRemove,
  onAdd,
  onProgram,
  canProgram,
  targetSlot,
}) {
  const [tab, setTab] = useState("saved"),
    [query, setQuery] = useState("");
  const visible = rows.filter((row) =>
    `${row.snapshot.callsign} ${row.snapshot.city}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <section className="radio-tables" aria-label="Channel tables">
      <div className="radio-table-toolbar">
        <button aria-pressed={tab === "saved"} onClick={() => setTab("saved")}>
          Saved programming list ({rows.length})
        </button>
        <button aria-pressed={tab === "radio"} onClick={() => setTab("radio")}>
          Radio memories (128 slots)
        </button>
        <label>
          Filter channels
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      <p>
        Inline edits save unverified local drafts, not radio writes. Extracted
        occupied memories stay read-only; programming still targets an inspected
        empty slot and requires explicit confirmation.
      </p>
      {tab === "saved" ? (
        <Table title="Saved channel programming list">
          {visible.map((row) => (
            <EntryRow
              key={row.id + JSON.stringify(row.snapshot)}
              row={row}
              onSave={(entry) => onUpdate(row.id, { entry })}
              onRemove={() => onRemove(row.id)}
              onVerify={() => onUpdate(row.id, { verified: true })}
              onProgram={() => onProgram(row)}
              canProgram={canProgram}
              targetSlot={targetSlot}
            />
          ))}
          {!visible.length && (
            <tr>
              <td colSpan={9}>
                No matching saved channels. Enter a channel or capture radio
                memories.
              </td>
            </tr>
          )}
        </Table>
      ) : !inspection ? (
        <p>
          Register/select your physical radio, then click Extract radio memories
          and save private backup to populate all 128 slots.
        </p>
      ) : (
        <Table title="Extracted radio memories">
          {Array.from({ length: 128 }, (_, slot) => ({
            slot,
            memory: inspection.memories?.find((memory) => memory.slot === slot),
          }))
            .filter(({ memory, slot }) =>
              `${memory?.name || "empty"} ${slot}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map(({ slot, memory }) => (
              <EntryRow
                key={`${inspection.sha256}-${slot}`}
                memory={memory}
                slot={slot}
                residual={!memory && !inspection.emptySlots.includes(slot)}
                onSave={onAdd}
              />
            ))}
        </Table>
      )}
    </section>
  );
}
