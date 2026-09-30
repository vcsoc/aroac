import { useEffect, useState } from "react";
import {
  CTCSS_TONES,
  canExportChannel,
  chirpCsv,
} from "../shared/radioProgramming.js";
import { api, download } from "./lib";
import { confirmAction } from "./InterfaceUI";
import RadioChannelEntry, { ChannelForm } from "./RadioChannelEntry";
import RadioProfiles from "./RadioProfiles";
import RadioChannelTable from "./RadioChannelTable";
import "./radio-workspace.css";

function Channel({
  row,
  onUpdate,
  onRemove,
  onProgram,
  canProgram,
  targetSlot,
}) {
  const [offset, setOffset] = useState(
    row.offsetMHz == null ? "" : String(row.offsetMHz),
  );
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const save = async (patch) => {
    try {
      await onUpdate(row.id, patch);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  const s = row.snapshot;
  return (
    <section
      className="radio-programming-channel"
      aria-label={`Radio channel ${s.callsign || row.repeaterId}`}
    >
      <h4>
        {s.callsign || "Unnamed repeater"} · {s.outputMHz.toFixed(4)} MHz
      </h4>
      {s.receiveOnly && <b>Receive-only memory — transmitter disabled</b>}
      {s.source === "manual" && (
        <button onClick={() => setEditing(!editing)}>
          {editing ? "Hide edit form" : "Edit channel frequencies/name"}
        </button>
      )}
      {editing && (
        <ChannelForm
          initial={{
            name: s.callsign,
            rxMHz: s.outputMHz,
            txMHz: s.outputMHz + row.offsetMHz,
            receiveOnly: !!s.receiveOnly,
            tone: row.toneMode === "tone" ? row.txTone : "none",
            mode: s.mode,
            notes: s.city,
          }}
          submitLabel="Save edited channel (clears verification)"
          onCancel={() => setEditing(false)}
          onSave={async (entry) => {
            await onUpdate(row.id, { entry });
            setEditing(false);
          }}
        />
      )}
      <small>
        {s.city || "Location not supplied"} · {s.mode || "Mode unknown"} ·{" "}
        {s.directoryStatus}
        {s.restriction ? ` · Access: ${s.restriction}` : ""}
      </small>
      <p>
        Directory “encode”: {s.directoryEncode}
        <br />
        Directory “decode”: {s.directoryDecode}
        <br />
        Check the required transmit tone independently; provider encode/decode
        direction is not assumed.
      </p>
      <label>
        Signed repeater offset (MHz)
        <input
          type="number"
          min="-10"
          max="10"
          step="any"
          value={offset}
          disabled={!!s.receiveOnly}
          aria-label={`Signed repeater offset for ${s.callsign || row.repeaterId}`}
          onChange={(e) => setOffset(e.target.value)}
          onBlur={() => {
            const value = offset.trim() === "" ? null : Number(offset);
            if (value !== row.offsetMHz) save({ offsetMHz: value });
          }}
        />
      </label>
      <label>
        Transmit/access tone to program
        <select
          aria-label={`Transmit tone for ${s.callsign || row.repeaterId}`}
          disabled={!!s.receiveOnly}
          value={row.toneMode === "tone" ? `tone:${row.txTone}` : row.toneMode}
          onChange={(e) => {
            const value = e.target.value;
            save(
              value.startsWith("tone:")
                ? { toneMode: "tone", txTone: value.slice(5) }
                : { toneMode: value },
            );
          }}
        >
          <option value="unknown">Not verified — do not export</option>
          <option value="none">No TX tone (confirm independently)</option>
          {CTCSS_TONES.map((tone) => (
            <option key={tone} value={`tone:${tone.toFixed(1)}`}>
              {tone.toFixed(1)} Hz CTCSS
            </option>
          ))}
        </select>
      </label>
      <p>
        Receiver/squelch tone is not exported: leave receive tone off unless
        independently verified. The directory may be inaccurate or outdated.
      </p>
      <div className="button-row">
        <button
          aria-label={`Verify radio channel ${s.callsign || row.repeaterId}`}
          disabled={!!row.verified}
          onClick={async () => {
            if (
              await confirmAction(
                s.receiveOnly
                  ? "Confirm you independently checked this receive-only channel’s frequency and analog mode. The radio memory will have its transmitter disabled. AROAC cannot verify the source or local receiving restrictions."
                  : "Confirm you checked this channel’s receive/transmit frequencies, signed offset, analog FM mode, transmit tone, licence and current operating/access status with an up-to-date source or operator. AROAC cannot verify these for you.",
              )
            )
              save({ verified: true });
          }}
        >
          {row.verified ? "Verified for CSV" : "Mark settings verified"}
        </button>
        {canExportChannel(row) && window.oarDesktop?.programUV5R && (
          <button
            disabled={!canProgram}
            onClick={() => onProgram(row)}
            aria-label={`Program radio channel ${s.callsign || row.repeaterId} to memory ${targetSlot}`}
          >
            Program to empty memory {targetSlot} via USB
          </button>
        )}
        <button
          aria-label={`Remove radio channel ${s.callsign || row.repeaterId}`}
          onClick={() => onRemove(row.id)}
        >
          Remove
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export default function RadioProgramming({
  user,
  revision,
  directory,
  onDownload,
}) {
  const [rows, setRows] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [radioBusy, setRadioBusy] = useState(false),
    [backupStatus, setBackupStatus] = useState(""),
    [inspection, setInspection] = useState(null),
    [pending, setPending] = useState(null),
    [targetSlot, setTargetSlot] = useState(127),
    [activePort, setActivePort] = useState(""),
    [ports, setPorts] = useState([]),
    [selectedRadio, setSelectedRadio] = useState(null);
  useEffect(() => {
    setRows([]);
    if (!user) {
      setRows([]);
      return;
    }
    let active = true;
    api("/radio-channels")
      .then((value) => {
        if (active) {
          setRows(value);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [user?.id, revision]);
  useEffect(() => {
    if (!window.oarDesktop?.radioPorts) return;
    window.oarDesktop
      .radioPorts()
      .then((found) => {
        setPorts(found);
        setActivePort(
          (current) =>
            current || found.find((port) => port.accessible)?.path || "",
        );
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    setSelectedRadio(null);
    setInspection(null);
    setBackupStatus("");
    if (!user || !window.oarDesktop?.radioPending) {
      setPending(null);
      setInspection(null);
      setSelectedRadio(null);
      return;
    }
    let active = true;
    window.oarDesktop
      .radioPending()
      .then((value) => {
        if (active) {
          setPending(value);
          if (value?.device) setActivePort(value.device);
        }
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);
  const update = async (id, patch) => {
    const value = await api(`/radio-channels/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setRows((items) => items.map((item) => (item.id === id ? value : item)));
  };
  const remove = async (id) => {
    try {
      await api(`/radio-channels/${id}`, { method: "DELETE" });
      setRows((items) => items.filter((item) => item.id !== id));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  const verified = rows.filter(canExportChannel);
  const refreshPending = async () => {
    if (window.oarDesktop?.radioPending)
      setPending(await window.oarDesktop.radioPending());
  };
  const program = async (row) => {
    if (
      !inspection ||
      !activePort ||
      pending ||
      radioBusy ||
      !inspection.emptySlots.includes(targetSlot)
    )
      return;
    const rx = row.snapshot.outputMHz;
    const tx = rx + row.offsetMHz;
    const approved = await confirmAction(
      `Program ${row.snapshot.callsign} into EMPTY radio memory ${targetSlot} on ${selectedRadio?.label || "selected radio"} (physical serial/label ${selectedRadio?.serial || "unselected"})? Receiver: ${rx.toFixed(5)} MHz; transmitter: ${row.snapshot.receiveOnly ? "DISABLED" : tx.toFixed(5) + " MHz"}; ${row.toneMode === "tone" ? `${row.txTone} Hz transmit CTCSS` : "no transmit tone"}; ${row.snapshot.mode}. Verify this radio is the photographed UV-5R, your licence permits the TX frequency, and the repeater owner confirms its access settings. AROAC saves a complete backup before writing. Afterward you MUST power-cycle and verify the entire image in AROAC before transmitting. Cancel keeps radio unchanged.`,
    );
    if (!approved) return;
    setRadioBusy(true);
    try {
      const operation = await window.oarDesktop.programUV5R(
        activePort,
        row,
        targetSlot,
        inspection.sha256,
        selectedRadio?.id,
      );
      setPending(operation);
      setInspection(null);
      setBackupStatus(
        `Commands acknowledged for memory ${targetSlot}. POWER-CYCLE the radio, then press Verify. Do not transmit before verification. Backup: ${operation.backupFile}`,
      );
      setError("");
    } catch (e) {
      setError(
        `${e.message} A write MAY have arrived: power-cycle, then verify before any retry.`,
      );
      await refreshPending().catch(() => {});
      setInspection(null);
    } finally {
      setRadioBusy(false);
    }
  };
  const verify = async () => {
    setRadioBusy(true);
    try {
      const result = await window.oarDesktop.verifyUV5R(activePort);
      await refreshPending();
      setInspection(null);
      setError("");
      setBackupStatus(
        result.state === "programmed"
          ? `SUCCESS: memory ${result.slot} and the entire radio image match the planned write. Private verification backup: ${result.backupFile}`
          : result.state === "restored" || result.state === "unchanged"
            ? `Original radio image confirmed; no programming remains pending. Private backup: ${result.backupFile}`
            : `Memory ${result.slot} does NOT match the planned or original full image. Do not transmit. A read-only backup was saved: ${result.backupFile}. ${result.restoreAllowed ? "You may restore the original empty slot below." : "Other radio data changed; automatic restoration is blocked."}`,
      );
    } catch (e) {
      setError(
        `${e.message} If the radio was just written, power-cycle it and retry READ-ONLY verification. Do not write again.`,
      );
    } finally {
      setRadioBusy(false);
    }
  };
  const restore = async () => {
    if (
      !pending ||
      !(await confirmAction(
        `RESTORE radio memory ${pending.slot} from the private backup? This WRITES the original slot bytes to the radio. Confirm the radio was power-cycled after the last write, is the same UV-5R, and do not transmit until a second power cycle and full read-only verification.`,
      ))
    )
      return;
    setRadioBusy(true);
    try {
      const result = await window.oarDesktop.restoreUV5R(
        activePort,
        pending.slot,
      );
      await refreshPending();
      setError("");
      setBackupStatus(
        result.state === "restored"
          ? "Original memory was already intact and verified."
          : `Restoration commands acknowledged for slot ${pending.slot}. POWER-CYCLE the radio, then Verify read-only before transmitting.`,
      );
    } catch (e) {
      setError(
        `${e.message} Do not retry a write. Power-cycle and Verify read-only first.`,
      );
      await refreshPending().catch(() => {});
    } finally {
      setRadioBusy(false);
    }
  };
  return (
    <section className="radio-programming">
      <h3>Radio programming list</h3>
      {user && (
        <p>
          {rows.length}/128 saved channels · {verified.length} verified ·{" "}
          {rows.length - verified.length} awaiting verification. Program one
          verified channel at a time; after each write, power-cycle and verify
          before preparing the next empty slot.
        </p>
      )}
      {user && <RadioChannelTable key={user.id} rows={rows} inspection={inspection}
        onUpdate={update} onRemove={remove} onProgram={program} targetSlot={targetSlot}
        canProgram={!!selectedRadio && !!inspection?.emptySlots.includes(targetSlot) && !!activePort && !pending && !radioBusy}
        onAdd={async (entry) => {
          const added = await api("/radio-channels/manual", { method: "POST", body: JSON.stringify({ channels: [entry] }) });
          setRows((current) => [...current, ...added]);
        }} />}
      {user && (
        <RadioChannelEntry
          key={user.id}
          onSave={async (channels) => {
            const added = await api("/radio-channels/manual", {
              method: "POST",
              body: JSON.stringify({ channels }),
            });
            setRows((current) => [...current, ...added]);
          }}
        />
      )}
      {user && window.oarDesktop?.radioProfiles && (
        <RadioProfiles
          key={user.id}
          user={user}
          activePort={activePort}
          busy={radioBusy}
          setBusy={setRadioBusy}
          pending={pending}
          selected={selectedRadio}
          onSelect={(radio) => {
            setSelectedRadio(radio);
            setInspection(null);
          }}
          onInspection={(value) => {
            setInspection(value);
            setTargetSlot(value.emptySlots.at(-1) ?? 127);
          }}
        />
      )}
      <p>
        Choose a repeater on the map and select “Add to radio programming list”
        in its right-hand details. This list is private to your signed-in local
        station profile.
      </p>
      <p>
        <strong>
          {window.oarDesktop?.platform === "linux"
            ? "Direct USB programming: tested UV-5R identity on Linux only."
            : "Direct USB programming is available only in the tested Linux desktop app."}
        </strong>{" "}
        A cable alone does not identify a radio. AROAC reads the connected radio
        twice, saves a private full backup, requires an empty slot and verified
        analog settings, then writes one channel at a time. The radio must be
        manually power-cycled before a separate full-image read-only
        verification. Do not transmit before that verification. Other firmware,
        handsets and desktop/mobile platforms are not validated for USB
        programming.
      </p>
      {inspection?.memories && (
        <details className="radio-memory-capture">
          <summary>
            Capture programmed memories from{" "}
            {selectedRadio?.label || "inspected radio"} (
            {inspection.memories.length})
          </summary>
          <p>
            This is a read-only snapshot. Adding a captured memory to the list
            does not write it and never marks it verified. Unsupported
            DCS/receive squelch settings are not silently converted.
          </p>
          {inspection.memories.map((memory) => (
            <section key={memory.slot}>
              <p>
                Slot {memory.slot} · {memory.name} · RX{" "}
                {memory.rxMHz.toFixed(5)} MHz · TX{" "}
                {memory.receiveOnly
                  ? "disabled"
                  : memory.txMHz?.toFixed(5) || "unknown"}{" "}
                · tone {memory.tone} · {memory.mode}
              </p>
              <small>{memory.warning}</small>
              <button
                disabled={!memory.supportedForCapture}
                onClick={async () => {
                  try {
                    const entry = {
                      name:
                        memory.name
                          .toUpperCase()
                          .replace(/[^A-Z0-9_-]/g, "")
                          .slice(0, 7) || `CH${memory.slot}`,
                      rxMHz: memory.rxMHz,
                      txMHz: memory.txMHz,
                      receiveOnly: memory.receiveOnly,
                      tone: memory.tone,
                      mode: memory.mode,
                      notes: `Captured from ${selectedRadio?.label || "radio"}, slot ${memory.slot}; verify independently`,
                    };
                    const added = await api("/radio-channels/manual", {
                      method: "POST",
                      body: JSON.stringify({ channels: [entry] }),
                    });
                    setRows((current) => [...current, ...added]);
                    setError("");
                  } catch (reason) {
                    setError(reason.message);
                  }
                }}
              >
                Capture slot {memory.slot} to private programming list
              </button>
            </section>
          ))}
        </details>
      )}
      {window.oarDesktop?.platform === "linux" && (
        <div className="directory-status" role="status">
          <b>USB-serial cable detection</b>
          <label>
            Cable for radio registration and programming
            <select
              aria-label="Radio USB-serial cable"
              disabled={radioBusy || !!pending}
              value={activePort}
              onChange={(event) => {
                setActivePort(event.target.value);
                setInspection(null);
              }}
            >
              <option value="">Choose cable</option>
              {ports.map((port) => (
                <option value={port.path} key={port.path}>
                  {port.name} · {port.path}
                </option>
              ))}
            </select>
          </label>
          {ports.length ? (
            ports.map((port) => (
              <div key={port.path}>
                <p>
                  {port.name} · {port.path} ·{" "}
                  {port.accessible
                    ? "Port accessible; radio identity checked only when a read begins"
                    : "Permission denied; authorize this cable using your system password prompt"}
                </p>
                {port.accessible && (
                  <button
                    aria-label="Inspect empty memories and save full private backup"
                    disabled={!user || radioBusy || !selectedRadio}
                    onClick={async () => {
                      setRadioBusy(true);
                      setBackupStatus("");
                      try {
                        const result = await window.oarDesktop.backupUV5R(
                          port.path,
                          selectedRadio?.id,
                        );
                        setInspection(result);
                        setTargetSlot(result.emptySlots.at(-1) ?? 127);
                        setActivePort(port.path);
                        setBackupStatus(
                          `Read twice, verified ${result.version}; ${result.emptySlots.length} empty memories; private ${result.filename} (SHA-256 ${result.sha256}). No memory writes sent.`,
                        );
                        setError("");
                      } catch (e) {
                        setError(e.message);
                      } finally {
                        setRadioBusy(false);
                      }
                    }}
                  >
                    Extract radio memories and save private backup
                  </button>
                )}
                {!port.accessible && (
                  <button
                    onClick={async () => {
                      try {
                        await window.oarDesktop.requestRadioPortAccess(
                          port.path,
                        );
                        setPorts(await window.oarDesktop.radioPorts());
                        if (!pending) setActivePort(port.path);
                        setError("");
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    Authorize cable access (system prompt)
                  </button>
                )}
              </div>
            ))
          ) : (
            <p>No USB-serial cable detected.</p>
          )}
          {backupStatus && <p role="status">{backupStatus}</p>}
          {pending && (
            <div role="status" className="radio-programming-pending">
              <strong>
                Radio write not yet fully verified: slot {pending.slot} ·{" "}
                {pending.callsign}
              </strong>
              <p>
                POWER-CYCLE the connected radio after a write, then select
                Verify. Do not transmit until the full-image comparison
                succeeds. If an acknowledgement was lost, the write may still
                have arrived; never retry blindly.
              </p>
              <p>Original private backup: {pending.backupFile}</p>
              <button disabled={radioBusy || !activePort} onClick={verify}>
                Verify full radio image (read-only)
              </button>
              {pending.stage === "mismatch" && (
                <button disabled={radioBusy || !activePort} onClick={restore}>
                  Restore original slot {pending.slot} (write; requires
                  confirmation)
                </button>
              )}
            </div>
          )}
          {inspection && !pending && (
            <label>
              Empty radio memory slot for next verified channel
              <select
                aria-label="Empty radio memory slot"
                disabled={radioBusy}
                value={targetSlot}
                onChange={(event) => setTargetSlot(Number(event.target.value))}
              >
                {inspection.emptySlots.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
              <small>
                Only fully empty memory and name slots are offered. Selecting a
                slot does not write anything.
              </small>
            </label>
          )}
          <button
            onClick={() =>
              window.oarDesktop
                .radioPorts()
                .then((found) => {
                  setPorts(found);
                  if (!pending)
                    setActivePort((current) =>
                      found.some((port) => port.path === current)
                        ? current
                        : found.find((port) => port.accessible)?.path || "",
                    );
                })
                .catch((e) => setError(e.message))
            }
          >
            Refresh cable status
          </button>
        </div>
      )}
      <div className="directory-status">
        <p role="status">
          {directory.loading
            ? "Loading repeater directory…"
            : directory.error ||
              (directory.value
                ? `${directory.value.repeaters.length.toLocaleString()} repeaters saved · ${new Date(directory.value.fetchedAt).toLocaleString()}${directory.value.stale ? " · potentially outdated" : ""}`
                : "No repeater directory loaded.")}
        </p>
        <button
          disabled={directory.loading}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await onDownload();
              setError(
                result?.stale
                  ? "Using saved directory; fresh download unavailable."
                  : result
                    ? ""
                    : "Could not download repeaters; see status above.",
              );
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Download repeaters for offline use
        </button>
      </div>
      {!user ? (
        <p role="status">Sign in to create a private programming list.</p>
      ) : (
        <>
          {rows.length === 0 && (
            <p>
              No radio channels saved yet. Show repeaters on the map, select
              one, then add it here.
            </p>
          )}
          <details className="radio-detailed-cards"><summary>Detailed channel cards and directory reports</summary>
          {rows.map((row) => (
            <Channel
              key={row.id}
              row={row}
              onUpdate={update}
              onRemove={remove}
              onProgram={program}
              targetSlot={targetSlot}
              canProgram={
                !!selectedRadio &&
                !!inspection?.emptySlots.includes(targetSlot) &&
                !!activePort &&
                !pending &&
                !radioBusy
              }
            />
          ))}</details>
          <button
            disabled={busy || verified.length === 0}
            onClick={async () => {
              setBusy(true);
              try {
                await download(
                  "aroac-verified-radio-memories.csv",
                  chirpCsv(verified),
                );
                setError("");
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Export {verified.length} verified analog channels as CSV
          </button>
          {rows.length > verified.length && (
            <p>
              {rows.length - verified.length} channel(s) not exportable yet:
              verify analog mode, supported band, offset, tone and open status.
              Digital-only or restricted repeaters cannot be exported for a
              UV-5R.
            </p>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
