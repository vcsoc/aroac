import { useEffect, useRef, useState } from "react";
import {
  X,
  Radio,
  Search,
  Send,
  Plus,
  Download,
  Trash2,
  LogOut,
} from "lucide-react";
import { api, post, adif, download } from "./lib";
import { isNative } from "./platform";
import { confirmAction } from "./InterfaceUI";
import { toast, useToastStatus } from "./Toasts";
import { Switch } from "./MapPanels";
import { validateRegistration } from "../shared/registration.js";
export function Auth({ onClose, onUser }) {
  const [rememberCall, setRememberCall] = useState(
    () => localStorage.getItem("oar-remember-callsign") === "true",
  );
  const [register, setRegister] = useState(false),
    [error, setError] = useState(""),
    [fields, setFields] = useState({}),
    [busy, setBusy] = useState(false);
  const fieldError = (name) =>
    fields[name] ? (
      <small id={"auth-" + name + "-error"} className="field-error">
        {fields[name]}
      </small>
    ) : null;
  const ref = useRef();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget,
      raw = Object.fromEntries(new FormData(form));
    setError("");
    setFields({});
    let body = raw;
    if (register) {
      const checked = validateRegistration(raw);
      if (raw.authorized !== "on")
        checked.fields.authorized =
          "Confirm that you are authorised to use this callsign.";
      if (Object.keys(checked.fields).length) {
        setFields(checked.fields);
        setError("Please correct the highlighted fields.");
        form.elements.namedItem(Object.keys(checked.fields)[0])?.focus();
        return;
      }
      body = checked.values;
    } else if (!raw.callsign?.trim() || !raw.password) {
      setError("Enter your callsign and password.");
      return;
    }
    setBusy(true);
    try {
      const user = await post(register ? "/register" : "/login", body);
      if (rememberCall)
        localStorage.setItem("oar-saved-callsign", user.callsign);
      onUser(user);
    } catch (error) {
      setFields(error.fields || {});
      setError(
        Object.keys(error.fields || {}).length
          ? "Please correct the highlighted fields."
          : error.message,
      );
      form.elements
        .namedItem(Object.keys(error.fields || {})[0] || "callsign")
        ?.focus();
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog ref={ref} className="auth-dialog" onCancel={onClose}>
      <button
        className="close icon-button"
        aria-label="Close"
        onClick={onClose}
      >
        <X />
      </button>
      <Radio className="accent" size={34} />
      <span className="eyebrow">WELCOME TO AROAC</span>
      <h2>
        {register ? "Your station starts here." : "Welcome back, operator."}
      </h2>
      <p>
        {isNative
          ? "Your callsign profile is stored locally on this device."
          : register
            ? "One callsign. A worldwide community."
            : "Sign in with your callsign to reconnect."}
      </p>
      <form
        onSubmit={submit}
        noValidate
        onChange={(e) => {
          const name = e.target.name;
          setFields((previous) => {
            const next = { ...previous };
            delete next[name];
            return next;
          });
          setError("");
        }}
      >
        <label>
          Callsign
          <input
            name="callsign"
            defaultValue={
              rememberCall
                ? localStorage.getItem("oar-saved-callsign") || ""
                : ""
            }
            aria-label="Callsign"
            aria-invalid={!!fields.callsign}
            aria-describedby={
              fields.callsign ? "auth-callsign-error" : undefined
            }
            autoFocus
            required
            maxLength={32}
            placeholder="e.g. ZS1ABC"
            autoComplete="username"
            className="uppercase"
          />
          {fieldError("callsign")}
        </label>
        {!register && (
          <div className="remember-callsign">
            <Switch
              label="Remember my callsign"
              value={rememberCall}
              onChange={(value) => {
                setRememberCall(value);
                localStorage.setItem("oar-remember-callsign", String(value));
                if (!value) localStorage.removeItem("oar-saved-callsign");
              }}
            />
          </div>
        )}
        {register && (
          <>
            <label>
              Name
              <input
                name="name"
                aria-label="Name"
                aria-invalid={!!fields.name}
                aria-describedby={fields.name ? "auth-name-error" : undefined}
                autoComplete="name"
                required
                maxLength={80}
              />
              {fieldError("name")}
            </label>
            <label>
              Email <small>Private · not shown to other operators</small>
              <input
                name="email"
                aria-label="Email"
                aria-invalid={!!fields.email}
                aria-describedby={fields.email ? "auth-email-error" : undefined}
                type="email"
                autoComplete="email"
                required
              />
              {fieldError("email")}
            </label>
            <label>
              Maidenhead grid (optional)
              <input
                name="grid"
                pattern="[A-Ra-r]{2}[0-9]{2}([A-Xa-x]{2})?"
                placeholder="Leave blank if you don't know it"
                className="uppercase"
                aria-label="Maidenhead grid (optional)"
                aria-invalid={!!fields.grid}
                aria-describedby={
                  "grid-help" + (fields.grid ? " auth-grid-error" : "")
                }
              />
              {fieldError("grid")}
              <small id="grid-help">
                A short code for your approximate station location. You can skip
                this and add it later.
              </small>
            </label>
          </>
        )}
        <label>
          Password
          <input
            name="password"
            aria-label="Password"
            aria-invalid={!!fields.password}
            aria-describedby={
              fields.password ? "auth-password-error" : undefined
            }
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            minLength={register ? 12 : 1}
            maxLength={128}
            required
            placeholder={register ? "At least 12 characters" : ""}
          />
          {fieldError("password")}
        </label>
        {register && (
          <label className="check-label">
            <input
              type="checkbox"
              name="authorized"
              required
              aria-invalid={!!fields.authorized}
              aria-describedby={
                fields.authorized ? "auth-authorized-error" : undefined
              }
            />
            {isNative
              ? "I am authorised to use this callsign. This creates a local profile, not an online registration."
              : "I am authorised to use this callsign. My name, grid and callsign will be visible to signed-in operators."}
          </label>
        )}
        {fieldError("authorized")}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary full" disabled={busy}>
          {busy ? "Please wait…" : register ? "Create station" : "Sign in"}
        </button>
      </form>
      <button
        className="text-button"
        onClick={() => {
          setRegister(!register);
          setError("");
          setFields({});
        }}
      >
        {register
          ? "Already registered? Sign in"
          : "New here? Create your station"}
      </button>
      <small>
        Callsign ownership is not independently verified. No password recovery
        service is configured in this version.
      </small>
    </dialog>
  );
}
export function Messages({ user }) {
  const [contacts, setContacts] = useState([]),
    [query, setQuery] = useState(""),
    [results, setResults] = useState([]),
    [peer, setPeer] = useState(null),
    [messages, setMessages] = useState([]),
    [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const end = useRef();
  useEffect(() => {
    let live = true;
    const load = () =>
      api("/contacts")
        .then((x) => {
          if (live) setContacts(x);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    load();
    const id = setInterval(load, 5000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);
  useEffect(() => {
    let live = true;
    const id = setTimeout(() => {
      if (query.trim())
        api("/operators?q=" + encodeURIComponent(query))
          .then((x) => {
            if (live) setResults(x);
          })
          .catch((e) => {
            if (live) setError(e.message);
          });
      else setResults([]);
    }, 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [query]);
  useEffect(() => {
    setMessages([]);
    if (!peer) return;
    let live = true;
    const load = () =>
      api("/messages/" + peer.id)
        .then((x) => {
          if (live) setMessages(x);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    load();
    const id = setInterval(load, 3000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [peer?.id]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);
  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const message = await post("/messages/" + peer.id, { body });
      setMessages((prev) =>
        prev.some((m) => m.id === message.id) ? prev : [...prev, message],
      );
      setBody("");
      setContacts(await api("/contacts"));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function connect(person) {
    setError("");
    try {
      await post("/contacts/" + person.id, {});
      setContacts(await api("/contacts"));
      setPeer(person);
      setQuery("");
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">OPERATOR TO OPERATOR</span>
          <h2>Keep the conversation going.</h2>
          <p>
            Private in-app messages, addressed by callsign. Refreshes every 3
            seconds.
          </p>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="panel messenger">
        <aside>
          <label className="search-box">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Find callsign"
              placeholder="Find a callsign…"
            />
          </label>
          <span className="eyebrow">
            {query ? "FIND OPERATORS" : "YOUR CONNECTIONS"}
          </span>
          {(query ? results : contacts).map((c) => (
            <button
              className={"contact " + (peer?.id === c.id ? "active" : "")}
              key={c.id}
              onClick={() => (query ? connect(c) : setPeer(c))}
            >
              <span className="avatar">{c.callsign.slice(0, 2)}</span>
              <span>
                <b>{c.callsign}</b>
                <small>
                  {c.name} · {c.grid}
                </small>
              </span>
            </button>
          ))}
          {!(query ? results : contacts).length && (
            <p className="muted">
              {query
                ? "No matching callsigns."
                : "Search a callsign to start a conversation. Incoming conversations appear here."}
            </p>
          )}
        </aside>
        <section className="conversation">
          {peer ? (
            <>
              <div className="conversation-header">
                <b>{peer.callsign}</b>
                <small>
                  {peer.name} · {peer.grid} · unverified callsign
                </small>
              </div>
              <div className="messages">
                {!messages.length && (
                  <p className="empty">Say hello to {peer.callsign}. 73!</p>
                )}
                {messages.map((m) => (
                  <div
                    className={
                      "message " + (m.sender === user.id ? "mine" : "")
                    }
                    key={m.id}
                  >
                    <p>{m.body}</p>
                    <small>{new Date(m.created).toLocaleString()}</small>
                  </div>
                ))}
                <div ref={end} />
              </div>
              <form className="composer" onSubmit={send}>
                <input
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={2000}
                  required
                  aria-label="Message"
                  placeholder={"Message " + peer.callsign + "…"}
                />
                <button
                  className="primary"
                  aria-label="Send message"
                  disabled={busy || !body.trim()}
                >
                  <Send size={18} />
                </button>
              </form>
              <small className="privacy-note">
                Stored on the server · not end-to-end encrypted · latest 200
                messages
              </small>
            </>
          ) : (
            <div className="empty">
              <Radio size={40} />
              <h3>Start with a callsign.</h3>
              <p>Select a connection or find another operator.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
export function Logbook() {
  const [rows, setRows] = useState([]),
    [error, setError] = useState(""),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false);
  const load = () =>
    api("/logbook")
      .then(setRows)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  async function submit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    data.created = new Date(data.created + "Z").toISOString();
    setBusy(true);
    try {
      await post("/logbook", data);
      await load();
      toast(`Logged QSO with ${data.callsign} in your local logbook.`);
      setShow(false);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">EVERY CONTACT HAS A STORY</span>
          <h2>Your logbook.</h2>
          <p>{rows.length} contacts · securely scoped to your account</p>
        </div>
        <div className="button-row">
          <button
            onClick={() =>
              download("aroac-logbook.adi", adif(rows)).catch((e) =>
                setError(e.message),
              )
            }
            disabled={!rows.length}
          >
            <Download size={16} />
            Export ADIF
          </button>
          <button className="primary" onClick={() => setShow(!show)}>
            <Plus size={16} />
            Log contact
          </button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {show && (
        <form className="panel qso-form" onSubmit={submit}>
          <label>
            Callsign
            <input
              name="callsign"
              required
              placeholder="DX callsign"
              className="uppercase"
            />
          </label>
          <label>
            Frequency (MHz)
            <input
              name="frequency"
              type="number"
              min="0.001"
              max="300000"
              step="any"
              required
              defaultValue="14.074"
            />
          </label>
          <label>
            Mode
            <select name="mode">
              {["FT8", "FT4", "SSB", "CW", "FM", "AM", "RTTY", "DIGITAL"].map(
                (m) => (
                  <option key={m}>{m}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Date & time (UTC)
            <input
              name="created"
              type="datetime-local"
              defaultValue={new Date().toISOString().slice(0, 16)}
              required
            />
          </label>
          <label className="wide">
            Notes
            <input name="notes" maxLength={2000} />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save contact"}
          </button>
        </form>
      )}
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>CALLSIGN</th>
              <th>UTC</th>
              <th>MHz</th>
              <th>MODE</th>
              <th>NOTES</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="accent">{r.callsign}</td>
                <td>{r.created.replace("T", " ").slice(0, 16)}</td>
                <td>{r.frequency}</td>
                <td>
                  <span className="mode-tag">{r.mode}</span>
                </td>
                <td>{r.notes}</td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={"Delete contact " + r.callsign}
                    onClick={async () => {
                      if (
                        await confirmAction("Delete this contact permanently?")
                      )
                        try {
                          await api("/logbook/" + r.id, { method: "DELETE" });
                          load();
                        } catch (e) {
                          setError(e.message);
                        }
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">
            <Radio size={36} />
            <h3>Your next contact belongs here.</h3>
            <p>Log your first QSO and export it in ADIF format.</p>
          </div>
        )}
      </div>
    </>
  );
}
export function Profile({ user, setUser, onLogout, onEdit }) {
  const [status, setStatus] = useToastStatus(),
    [busy, setBusy] = useState(false);
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">STATION SETTINGS</span>
          <h2>{user.callsign}</h2>
          <p>Your public operator profile. Callsign ownership is unverified.</p>
        </div>
        <button onClick={onLogout}>
          <LogOut size={16} />
          Sign out
        </button>
      </div>
      {onEdit && (
        <button className="primary" onClick={onEdit}>
          Edit profile, avatar & devices
        </button>
      )}
      <form
        className="panel profile-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            setUser(
              await api("/me", {
                method: "PATCH",
                body: JSON.stringify(
                  Object.fromEntries(new FormData(e.currentTarget)),
                ),
              }),
            );
            setStatus(
              `Updated the local operator profile for ${user.callsign}.`,
            );
          } catch (e) {
            setStatus(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Name
          <input name="name" defaultValue={user.name} maxLength={80} required />
        </label>
        <label>
          Maidenhead grid (optional)
          <input
            name="grid"
            defaultValue={user.grid}
            pattern="[A-Ra-r]{2}[0-9]{2}([A-Xa-x]{2})?"
            placeholder="Leave blank if unknown"
          />
        </label>
        <label>
          About your station
          <textarea
            name="bio"
            defaultValue={user.bio}
            maxLength={500}
            rows={4}
            placeholder="Your bands, equipment and interests…"
          />
        </label>
        <p className="muted">
          This optional code places your station approximately on the map. Leave
          it blank if unknown; no location will be guessed.
        </p>
        <button className="primary" disabled={busy}>
          Save station
        </button>
        {status && <p role="status">{status}</p>}
      </form>
      <article className="panel install-help">
        <h3>AROAC on every device</h3>
        <p>
          The desktop application includes its own database. Your profiles and
          logbook work offline; online providers supply maps and observations.
        </p>
        <small>
          Cross-device synchronization and operator messaging are not yet
          implemented in the standalone edition.
        </small>
      </article>
    </>
  );
}
