const semver = require("semver");
module.exports = function createUpdateController({
  updater,
  currentVersion,
  supported,
  supportReason,
  isOffline,
  getSkipped,
  setSkipped,
  backup,
  publish = () => {},
  restart,
  schedule = (fn, ms) => setTimeout(fn, ms),
}) {
  let state = { phase: "idle", currentVersion },
    checking = false,
    busy = false,
    candidate = null,
    available = null,
    manual = false;
  const set = (value) => {
    state = { currentVersion, ...value };
    publish(state);
    return state;
  };
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowDowngrade = false;
  updater.allowPrerelease = false;
  updater.disableDifferentialDownload = true;
  updater.on("update-available", (info) => {
    available = info;
  });
  updater.on("error", (error) => {
    if (checking || busy) {
      if (state.phase === "installing") busy = false;
      set({
        phase: "error",
        message: "Update failed: " + error.message,
        version: candidate?.version,
      });
    }
  });
  updater.on("download-progress", (progress) => {
    if (busy)
      set({
        phase: "downloading",
        version: candidate?.version,
        percent: Math.max(0, Math.min(100, Number(progress.percent) || 0)),
        transferred: progress.transferred,
        total: progress.total,
        message: "Downloading and verifying the matching package…",
      });
  });
  async function check(explicit = false) {
    if (checking || busy) return state;
    manual = explicit;
    if (!supported())
      return explicit
        ? set({ phase: "unsupported", message: supportReason() })
        : state;
    if (isOffline())
      return explicit
        ? set({
            phase: "error",
            message: "OAR is offline. Go online and check for updates again.",
          })
        : state;
    checking = true;
    available = null;
    if (explicit)
      set({
        phase: "checking",
        message:
          "Checking GitHub for a release matching this OS, architecture and package format…",
      });
    try {
      await updater.checkForUpdates();
      candidate =
        available &&
        semver.valid(available.version) &&
        semver.gt(available.version, currentVersion)
          ? available
          : null;
      if (!candidate)
        return explicit
          ? set({
              phase: "current",
              message:
                "You are running the latest available compatible version (" +
                currentVersion +
                ").",
            })
          : set({ phase: "idle" });
      if (!manual && getSkipped() === candidate.version)
        return set({ phase: "idle" });
      return set({
        phase: "available",
        version: candidate.version,
        message:
          "OAR " +
          candidate.version +
          " is available. Update and restart automatically, remind yourself later, or skip this version.",
      });
    } catch (e) {
      return explicit
        ? set({
            phase: "error",
            message: "Could not check for updates: " + e.message,
          })
        : set({ phase: "idle" });
    } finally {
      checking = false;
    }
  }
  async function install() {
    if (
      busy ||
      checking ||
      !candidate ||
      !["available", "error"].includes(state.phase)
    )
      return state;
    if (isOffline())
      return set({
        phase: "error",
        message: "Go online before downloading the update.",
        version: candidate.version,
      });
    busy = true;
    try {
      set({
        phase: "downloading",
        version: candidate.version,
        percent: 0,
        message: "Downloading and verifying the update…",
      });
      const files = await updater.downloadUpdate();
      if (!files?.length) throw Error("No verified package was downloaded.");
      set({
        phase: "backing-up",
        version: candidate.version,
        message:
          "Download verified. Creating a private backup of your station database and source configuration…",
      });
      await backup(candidate.version);
      set({
        phase: "installing",
        version: candidate.version,
        message: "Backup complete. Installing the update and restarting OAR…",
      });
      schedule(() => {
        try {
          restart();
        } catch (e) {
          busy = false;
          set({
            phase: "error",
            message: "Could not restart the installer: " + e.message,
            version: candidate.version,
          });
        }
      }, 1200);
    } catch (e) {
      busy = false;
      set({
        phase: "error",
        version: candidate.version,
        message:
          "The update was not installed: " +
          e.message +
          " Your existing installation remains available.",
      });
    }
    return state;
  }
  async function command(action) {
    if (action === "state") return state;
    if (action === "check") return check(true);
    if (action === "install") return install();
    if (!["later", "skip"].includes(action))
      throw Error("Invalid update action");
    if (busy || checking) return state;
    if (action === "skip" && candidate) await setSkipped(candidate.version);
    return set({ phase: "idle" });
  }
  return { check, command, getState: () => state };
};
