import { useEffect, useState } from "react";
import { Database, Download } from "lucide-react";
import { connection } from "./platform";
export default function LocalData() {
  const [info, setInfo] = useState(null),
    [status, setStatus] = useState("");
  useEffect(() => {
    connection()
      .then(setInfo)
      .catch((e) => setStatus(e.message));
  }, []);
  return (
    <article className="panel connection-settings">
      <Database className="accent" size={28} />
      <h3>Your station lives on this device.</h3>
      <p>
        Profiles, contacts and your logbook are stored in OAR’s own SQLite
        database. They work without internet. Nothing needs to be installed or
        started separately.
      </p>
      <label className="check-label">
        <input
          type="checkbox"
          checked={!!info?.offline}
          onChange={async (e) => {
            try {
              await window.oarDesktop.setOffline(e.target.checked);
              location.reload();
            } catch (error) {
              setStatus(error.message);
            }
          }}
        />
        Work offline — disable external imagery and feed requests
      </label>
      <label>
        Database location
        <code className="database-path">
          {info?.databasePath || "Opening local database…"}
        </code>
      </label>
      <button
        className="primary"
        onClick={async () => {
          try {
            const result = await window.oarDesktop.backup();
            setStatus(
              result.canceled
                ? "Backup canceled."
                : "Database backed up to " + result.path,
            );
          } catch (e) {
            setStatus(e.message);
          }
        }}
      >
        <Download size={16} />
        Back up database
      </button>
      {status && <p role="status">{status}</p>}
      <small>
        Backups contain all local profiles and private records. The database is
        not encrypted; keep your device and backups protected. Maps and fresh
        observations use online providers.
      </small>
      {info && !info.secureSessionStorage && (
        <small>
          OS encrypted credential storage is unavailable. Settings → Login
          offers explicit, trusted-device consent for an owner-only unencrypted
          session token. Otherwise sign in again after quitting. Your station
          data remains saved.
        </small>
      )}
    </article>
  );
}
