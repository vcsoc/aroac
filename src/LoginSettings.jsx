import { useEffect, useState } from "react";
import { Switch } from "./MapPanels";
import { confirmAction, Help } from "./InterfaceUI";
import { toast } from "./Toasts";
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
      <h3>
        Sign-in memory{" "}
        <Help label="About sign-in memory">
          By default you stay signed in while OAR is running, until you sign out
          or quit. No password is saved.
        </Help>
      </h3>
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
                  !(await confirmAction(
                    "No OS secret store is available. Save your sign-in token in an owner-only but UNENCRYPTED file on this trusted device? Anyone who can read it can use your local profile. Your password is not saved.",
                  ))
                )
                  return;
                setPrefs(
                  await window.oarDesktop.loginSettings(
                    value,
                    value && !prefs.secureStorage,
                  ),
                );
                setError("");
                toast(
                  value
                    ? "Sign-in persistence enabled on this device. You will remain signed in after restarting OAR until you log out."
                    : "Sign-in persistence disabled. You will need to sign in again after quitting OAR.",
                );
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
          <Help label="About disabling sign-in memory">
            Turning this off removes the saved session but keeps you signed in
            until you quit or sign out. The login screen’s Remember my callsign
            slider is separate and never stores your password.
          </Help>
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
