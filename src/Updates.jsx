import { useEffect, useState } from "react";
import { toast } from "./Toasts";
import ActionToast from "./ActionToast";
export async function checkForUpdates() {
  if (!window.oarDesktop?.update)
    return toast(
      "Updates are installed by the desktop application. Download a packaged release from github.com/vcsoc/aroac/releases.",
    );
  window.dispatchEvent(new Event("oar-update-notice"));
  try {
    await window.oarDesktop.update("check");
  } catch (e) {
    toast("Could not check for updates: " + e.message);
  }
}
export default function UpdateNotice() {
  const [state, setState] = useState({ phase: "idle" });
  const [noticeId, setNoticeId] = useState(0);
  useEffect(() => {
    const show = () => setNoticeId((id) => id + 1);
    window.addEventListener("oar-update-notice", show);
    return () => window.removeEventListener("oar-update-notice", show);
  }, []);
  useEffect(() => {
    if (!window.oarDesktop?.onUpdate) return;
    let live = true;
    const off = window.oarDesktop.onUpdate((value) => {
      if (live) setState(value);
    });
    window.oarDesktop
      .update("state")
      .then((value) => {
        if (live) setState(value);
      })
      .catch(() => {});
    return () => {
      live = false;
      off();
    };
  }, []);
  if (state.phase === "idle") return null;
  const busy = ["checking", "downloading", "backing-up", "installing"].includes(
    state.phase,
  );
  const act = async (action) => {
    try {
      setState(await window.oarDesktop.update(action));
    } catch (e) {
      toast(e.message);
    }
  };
  return (
    <ActionToast key={`${noticeId}-${state.phase}`} label="AROAC update">
      <strong>
        {state.version ? "Update to AROAC " + state.version : "AROAC updates"}
      </strong>
      <p>{state.message}</p>
      {state.phase === "available" && (
        <p>
          Save unfinished edits first. OAR backs up your local database before
          restarting. This notice hides after six seconds; use Check for updates
          to show it again.
        </p>
      )}
      {state.phase === "downloading" && (
        <>
          <progress
            max="100"
            value={state.percent || 0}
            aria-label="Update download progress"
          />
          <span>
            {Math.round(state.percent || 0)}%
            {state.total
              ? ` · ${Math.round((state.transferred || 0) / 1048576)} / ${Math.round(state.total / 1048576)} MiB`
              : ""}
          </span>
        </>
      )}
      {!busy && (
        <div className="button-row">
          {state.phase === "available" && (
            <>
              <button className="primary" onClick={() => act("install")}>
                Update and restart
              </button>
              <button onClick={() => act("skip")}>Skip this version</button>
            </>
          )}
          {state.phase === "error" && (
            <button onClick={checkForUpdates}>Check again</button>
          )}
          <button onClick={() => act("later")}>
            {state.phase === "available" ? "Later" : "Dismiss"}
          </button>
          {state.phase === "unsupported" && (
            <a
              href="https://github.com/vcsoc/aroac/releases"
              target="_blank"
              rel="noreferrer"
            >
              Open releases
            </a>
          )}
        </div>
      )}
    </ActionToast>
  );
}
