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
          By default you stay signed in while AROAC is running, until you sign
          out or quit. No password is saved. On a trusted device, persistence
          restores your session until you sign out; anyone with access to your
          unlocked desktop can use it.{" "}
          {prefs && !prefs.secureStorage
            ? "OS secret storage is unavailable. Enabling persistence requires confirmation to save an unencrypted session token restricted to your OS user. Prefer configuring or unlocking an OS secret store."
            : "Persistent tokens use the OS secret store when available."}{" "}
          Turning persistence off removes the saved token but keeps you signed
          in until you quit or sign out. Remember my callsign is separate and
          never saves your password.
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
                    ? "Sign-in persistence enabled on this device. You will remain signed in after restarting AROAC until you log out."
                    : "Sign-in persistence disabled. You will need to sign in again after quitting AROAC.",
                );
              } catch (e) {
                setError(e.message);
              }
            }}
          />
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
