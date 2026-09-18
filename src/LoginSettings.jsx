import { useEffect, useState } from "react";
import { Switch } from "./MapPanels";
export default function LoginSettings() {
  const [prefs, setPrefs] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    window.oarDesktop
      ?.loginSettings()
      .then(setPrefs)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section>
      <h3>Sign-in memory</h3>
      <p>
        By default you stay signed in while OAR is running, until you sign out
        or quit. No password is saved.
      </p>
      {prefs ? (
        <>
          <Switch
            label="Keep me signed in across restarts"
            value={prefs.persistLogin}
            onChange={async (value) => {
              try {
                if (
                  value &&
                  !prefs.secureStorage &&
                  !confirm(
                    "No OS secret store is available. Save your sign-in token in an owner-only but UNENCRYPTED file on this trusted device? Anyone who can read it can use your local profile. Your password is not saved.",
                  )
                )
                  return;
                setPrefs(
                  await window.oarDesktop.loginSettings(
                    value,
                    value && !prefs.secureStorage,
                  ),
                );
                setError("");
              } catch (e) {
                setError(e.message);
              }
            }}
            description="On this trusted device, restore your session until you manually sign out. Anyone with access to your desktop can use your local profile."
          />
          {!prefs.secureStorage && (
            <p>
              OS secret storage is unavailable. Enabling persistence requires
              confirmation to save an unencrypted session token in a file
              restricted to your OS user. Prefer configuring/unlocking an OS
              secret store; enable this fallback only on a trusted, protected
              device.
            </p>
          )}
          <p>
            Turning this off removes the saved session but keeps you signed in
            until you quit or sign out. The login screen’s Remember my callsign
            slider is separate and never stores your password.
          </p>
        </>
      ) : (
        <p>
          {window.oarDesktop
            ? "Loading…"
            : "Restart persistence is a desktop-only setting."}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
