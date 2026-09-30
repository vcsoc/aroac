import { useEffect, useState } from "react";

export default function RadioProfiles({
  user,
  activePort,
  busy,
  setBusy,
  pending,
  selected,
  onSelect,
  onInspection,
}) {
  const [radios, setRadios] = useState([]),
    [label, setLabel] = useState(""),
    [serial, setSerial] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [history, setHistory] = useState([]),
    [error, setError] = useState(""),
    [candidate, setCandidate] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    setRadios([]);
    setHistory([]);
    setCandidate("");
    setConfirmed(false);
    window.oarDesktop
      .radioProfiles()
      .then((found) => {
        if (live) {
          setRadios(found);
          setCandidate(pending?.radioId || "");
        }
      })
      .catch((reason) => {
        if (live) setError(reason.message);
      });
    return () => {
      live = false;
    };
  }, [user.id]);
  useEffect(() => {
    let live = true;
    setHistory([]);
    if (selected)
      window.oarDesktop
        .radioHistory(selected.id)
        .then((found) => {
          if (live) setHistory(found);
        })
        .catch((reason) => {
          if (live) setError(reason.message);
        });
    return () => {
      live = false;
    };
  }, [selected?.id]);
  return (
    <section
      className="radio-profile-manager"
      aria-label="Registered radios and backups"
    >
      <h4>Physical radio profiles and fingerprints</h4>
      <p>
        UV-5R clone mode does not expose a guaranteed unique serial. AROAC
        hashes clone identity, firmware and calibration regions, excluding
        programmed channels. This signature can be shared by radios or change
        after calibration. Each radio gets its own local profile ID and backup
        folder. Always check the physical serial/label; never identify a radio
        by the cable alone.
      </p>
      <label>
        Registered physical radio
        <select
          aria-label="Registered physical radio"
          disabled={busy || !!pending}
          value={candidate}
          onChange={(event) => {
            setCandidate(event.target.value);
            setConfirmed(false);
            onSelect(null);
          }}
        >
          <option value="">Choose a radio</option>
          {radios.map((radio) => (
            <option value={radio.id} key={radio.id}>
              {radio.label} · {radio.serial}
            </option>
          ))}
        </select>
      </label>
      {candidate && (
        <>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || !!pending}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I checked the connected radio’s physical serial/label matches this
            profile
          </label>
          <button
            disabled={!confirmed || busy || !!pending}
            onClick={() => {
              onSelect(radios.find((radio) => radio.id === candidate));
              setMessage(
                "Profile selected. Inspect the connected radio to verify its fingerprint and empty slots before programming.",
              );
            }}
          >
            Use this radio profile
          </button>
        </>
      )}
      {selected && (
        <>
          <p>
            Selected: <b>{selected.label}</b> · serial/label {selected.serial}
          </p>
          <p>
            Fingerprint v{selected.fingerprintVersion}:{" "}
            <code>{selected.fingerprint}</code>
          </p>
          <p>
            Profile ID: <code>{selected.id}</code>
          </p>
          {!!selected.matchingSignatureProfiles && (
            <p role="alert">
              {selected.matchingSignatureProfiles} other radio profiles share
              this signature. It cannot distinguish these radios; check the
              physical serial/label. Their backups remain in separate folders.
            </p>
          )}
          <button
            disabled={busy}
            onClick={async () => {
              try {
                setHistory(await window.oarDesktop.radioHistory(selected.id));
                setError("");
              } catch (reason) {
                setError(reason.message);
              }
            }}
          >
            Refresh this radio’s backup history
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              try {
                await window.oarDesktop.openRadioBackups(selected.id);
                setError("");
              } catch (reason) {
                setError(reason.message);
              }
            }}
          >
            Open this radio’s private backup folder
          </button>
          <details>
            <summary>
              {history.length} backups for {selected.label}
            </summary>
            {history.length ? (
              <ol>
                {history.map((backup) => (
                  <li key={backup.filename}>
                    <time>{new Date(backup.created).toLocaleString()}</time> ·{" "}
                    {backup.bytes} bytes
                    <br />
                    <code>{backup.filename}</code>
                    <br />
                    SHA-256: <code>{backup.sha256}</code>
                  </li>
                ))}
              </ol>
            ) : (
              <p>No backups recorded for this profile yet.</p>
            )}
          </details>
        </>
      )}
      <details>
        <summary>
          Register the connected radio and capture its fingerprint
        </summary>
        <form
          aria-label="Register physical radio"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!activePort) {
              setError("Choose an accessible connected cable first.");
              return;
            }
            setBusy(true);
            try {
              const result = await window.oarDesktop.enrollRadio(activePort, {
                label,
                serial,
                confirmPhysical: confirmed,
              });
              setRadios(await window.oarDesktop.radioProfiles());
              setCandidate(result.radio.id);
              onSelect(result.radio);
              onInspection({ ...result.backup, radioId: result.radio.id });
              setHistory(await window.oarDesktop.radioHistory(result.radio.id));
              setLabel("");
              setSerial("");
              setError("");
              setMessage(
                "Radio registered from two identical read-only image reads. Its first private backup is saved in its own folder. No write was sent.",
              );
            } catch (reason) {
              setError(reason.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Radio profile name
            <input
              required
              maxLength={80}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="My Baofeng UV-5R"
            />
          </label>
          <label>
            Physical serial or unique label
            <input
              required
              maxLength={80}
              value={serial}
              onChange={(event) => setSerial(event.target.value)}
              placeholder="Read the radio’s label, not the USB cable"
            />
          </label>
          <label>
            <input
              required
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I checked this physical radio’s label and understand the generated
            fingerprint is not a unique serial number
          </label>
          <button disabled={busy || !!pending || !activePort} type="submit">
            Register radio, fingerprint and private backup (read-only)
          </button>
        </form>
      </details>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
