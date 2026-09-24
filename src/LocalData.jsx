import { useEffect, useState } from "react";
import { Database, Download } from "lucide-react";
import { connection } from "./platform";
import { Help } from "./InterfaceUI";
import { useToastStatus } from "./Toasts";
export default function LocalData() {
  const [info, setInfo] = useState(null),
    [status, setStatus] = useToastStatus();
  useEffect(() => {
    connection()
      .then(setInfo)
      .catch((e) => setStatus(e.message));
  }, []);
  return (
    <article className="panel connection-settings">
      <Database className="accent" size={28} />
      <h3>
        Your station lives on this device.{" "}
        <Help label="About local storage">
          Profiles, contacts and your logbook are stored in AROAC’s own SQLite
          database. They work without internet. Nothing needs to be installed or
          started separately.
        </Help>
      </h3>
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
      <Help label="About database backups">
        Full database backup requires sign-in and is only offered on
        single-profile installations, since it includes private records.
        Multi-profile installations must use scoped exports. The database is not
        encrypted; keep your device and backups protected. Maps and fresh
        observations use online providers.
      </Help>
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
