import { useEffect, useState } from "react";
import "./relay.css";
import { confirmAction } from "./InterfaceUI";
export default function RelayPanel({ user }) {
  const [state, setState] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [device, setDevice] = useState(""),
    [candidate, setCandidate] = useState(null),
    [recipient, setRecipient] = useState(""),
    [text, setText] = useState("");
  const bridge = window.oarDesktop?.relay;
  useEffect(() => {
    if (!bridge) return;
    let live = true;
    const load = () =>
      bridge("status")
        .then((value) => {
          if (live) setState(value);
        })
        .catch(() => {
          if (live) setError("Relay settings could not be loaded.");
        });
    load();
    const timer = setInterval(load, 4000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [bridge, user?.id]);
  const run = async (action, input = {}) => {
    setBusy(true);
    setError("");
    try {
      const result = await bridge(action, { origin: state?.url, ...input });
      if (action === "peer") setCandidate(result);
      else setState(result);
      return result;
    } catch (e) {
      setError(
        e.message.replace(
          /^Error invoking remote method '[^']+': (?:Error: )?/,
          "",
        ),
      );
      return null;
    } finally {
      setBusy(false);
    }
  };
  if (!bridge)
    return (
      <section className="panel">
        <h2>Device messaging</h2>
        <p>
          Optional encrypted relay transport is available only in the Electron
          desktop application. Mobile transport is not implemented.
        </p>
      </section>
    );
  return (
    <section className="relay-panel">
      <h2>Device messaging · preview</h2>
      <p>
        OAR remains local-first. This optional relay carries encrypted
        one-to-one messages between explicitly verified devices. It is not a
        radio-licence or callsign identity service.
      </p>
      <p>
        <b>Relay:</b> {state?.url || "Not configured"}
      </p>
      {state?.loopbackTesting && (
        <p role="status">
          Local HTTP testing is enabled for loopback addresses only. HTTP does
          not authenticate the server or protect enrollment credentials in
          transit. Use disposable credentials; use HTTPS outside local testing.
        </p>
      )}
      <p>
        Adjacent settings.yaml is applied only when no relay is configured.
        Importing settings does not register this device or contact the relay.
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          if (
            state?.url &&
            !(await confirmAction(
              "Override this device’s relay settings? Other local profiles share this server setting, but keep separate identities and consent.",
            ))
          )
            return;
          setCandidate(null);
          setRecipient("");
          await run("import");
        }}
      >
        Import / override settings.yaml
      </button>
      {!user && <p>Sign in to use private messaging.</p>}
      {state && (
        <div role="status">
          <p>
            {state.storage?.message ||
              (!state.secureStorage
                ? "OS-protected credential storage is unavailable. Unlock your OS credential vault, then retry or restart OAR. Plaintext key storage is not permitted."
                : "OS-protected credential storage is available.")}
          </p>
          <button disabled={busy} onClick={() => run("retry-storage")}>
            Retry credential storage
          </button>{" "}
          <button disabled={busy} onClick={() => run("restart-storage")}>
            Restart OAR
          </button>
          <p>
            Retry after unlocking your vault. If it is still unavailable, fully
            restart OAR. Never delete saved relay data to fix a vault error.
          </p>
        </div>
      )}
      {user && state?.url && state.secureStorage && (
        <>
          <button
            disabled={busy}
            onClick={async () => {
              const enabled = !state.enabled;
              if (
                enabled &&
                !(await confirmAction(
                  `Allow automatic registration and message synchronization with ${state.url}? Only the enrollment credential, device public keys and encrypted messages are sent, not your callsign/profile. The relay still sees device IDs, IP addresses, recipients, sizes and timing.`,
                ))
              )
                return;
              await run("enable", { enabled });
            }}
          >
            {" "}
            {state.enabled
              ? "Disable automatic relay access"
              : "Enable automatic registration and messaging"}
          </button>
          {state.identity && (
            <p>
              Your device ID — share and verify through an independent trusted
              channel:
              <br />
              <code className="relay-id">{state.identity.deviceId}</code>
            </p>
          )}
          {state.enabled && (
            <>
              <p>
                Registration/synchronization runs automatically approximately
                every 45 seconds while signed in and online.
              </p>
              <button disabled={busy} onClick={() => run("sync")}>
                Synchronize now
              </button>
              <span> {state.pending} queued</span>
              <fieldset disabled={busy}>
                <legend>Add a verified device</legend>
                <label>
                  Peer device ID
                  <input
                    value={device}
                    onChange={(e) => {
                      setDevice(e.target.value.trim());
                      setCandidate(null);
                    }}
                    maxLength={43}
                  />
                </label>
                <button onClick={() => run("peer", { deviceId: device })}>
                  Look up device keys
                </button>
                {candidate && (
                  <div>
                    <code className="relay-id">{candidate.deviceId}</code>
                    <p>
                      Compare this complete ID with the other person through an
                      independent trusted channel. The relay cannot establish
                      their real-world identity for you. Encryption-key
                      signatures are checked automatically.
                    </p>
                    <button
                      onClick={async () => {
                        if (
                          !(await confirmAction(
                            "Have you independently verified this complete device ID? Trusting an unverified ID can expose messages to an impostor.",
                          ))
                        )
                          return;
                        if (
                          await run("trust", {
                            deviceId: candidate.deviceId,
                            keySignature: candidate.keySignature,
                          })
                        ) {
                          setRecipient(candidate.deviceId);
                          setCandidate(null);
                        }
                      }}
                    >
                      I verified this ID — pin keys
                    </button>
                  </div>
                )}
              </fieldset>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await run("send", { deviceId: recipient, text }))
                    setText("");
                }}
              >
                <label>
                  Recipient
                  <select
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                  >
                    <option value="">Choose a verified device</option>
                    {state.peers.map((peer) => (
                      <option key={peer.deviceId} value={peer.deviceId}>
                        {peer.deviceId}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Message
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={8192}
                  />
                </label>
                <button disabled={busy || !recipient || !text.trim()}>
                  Queue encrypted message
                </button>
              </form>
            </>
          )}
          {state.issues?.map((issue) => (
            <div key={issue.id}>
              <p role="status">{issue.error}</p>
              <code className="relay-id">{issue.senderId}</code>
              <button
                disabled={busy}
                onClick={async () => {
                  if (
                    await confirmAction(
                      "Permanently discard this encrypted message without reading it?",
                    )
                  )
                    await run("discard", { ids: [issue.id] });
                }}
              >
                Discard quarantined message
              </button>
            </div>
          ))}
          <div
            className="relay-history"
            aria-label="Private relay message history"
          >
            {state.messages.map((message) => (
              <article key={message.id + message.status}>
                <small>
                  {message.senderId === state.identity?.deviceId
                    ? "You → " + message.recipientId
                    : message.senderId + " → You"}{" "}
                  · {message.status}
                </small>
                <p>{message.text}</p>
              </article>
            ))}
          </div>
        </>
      )}
      <p>
        <small>
          Preview limitations: no forward secrecy, groups, key rotation,
          multi-device account sync or recovery. “Accepted by relay” is not a
          delivery/read receipt. Unknown senders remain encrypted until their
          device ID is verified. Relay keys/history are not included in SQLite
          backups. Keep enrollment YAML private. OS administrators can inspect
          application memory; this does not protect a compromised device.
        </small>
      </p>
      {(error || state?.error) && <p role="alert">{error || state.error}</p>}
    </section>
  );
}
