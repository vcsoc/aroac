// Configure Chromium before app.ready. Never substitute basic/plaintext storage.
function configureCredentialStorage(
  app,
  platform = process.platform,
  env = process.env,
) {
  if (platform !== "linux" || app.commandLine.hasSwitch("password-store"))
    return;
  const desktop = [
    env.XDG_CURRENT_DESKTOP,
    env.DESKTOP_SESSION,
    env.KDE_SESSION_VERSION || env.KDE_FULL_SESSION === "true" ? "KDE" : "",
  ]
    .filter(Boolean)
    .join(":");
  // Keep Chromium's version-aware KWallet selection on KDE/Plasma.
  if (/kde|plasma/i.test(desktop)) return;
  app.commandLine.appendSwitch("password-store", "gnome-libsecret");
}

function createCredentialStorage(storage, platform = process.platform) {
  let failure = null;
  function status() {
    let backend = platform,
      available = false;
    try {
      backend =
        platform === "linux"
          ? storage.getSelectedStorageBackend?.() || "unknown"
          : platform;
      available = storage.isEncryptionAvailable() && backend !== "basic_text";
    } catch {
      /* OS vault can disappear or deny access. */
    }
    const help =
      platform === "linux"
        ? "Unlock your desktop keyring or wallet. If none is installed, install and enable a Secret Service provider (such as GNOME Keyring) or KDE Wallet, then fully quit and reopen OAR."
        : platform === "darwin"
          ? "Unlock your login Keychain and allow OAR access, then retry."
          : "Sign in to your original Windows account and retry. Windows account protection must be available.";
    return {
      backend,
      available,
      failure,
      message: !available
        ? `OS-protected credential storage is unavailable (${backend}). ${help} Plaintext relay storage is never used.`
        : failure
          ? `The OS credential vault could not ${failure === "decrypt" ? "unlock saved OAR data" : "protect OAR data"}. ${help} Saved data has not been replaced. If this persists, the original OS account/key or an intact backup may be required.`
          : `OS credential backend: ${backend}. Access is verified when saving or unlocking data.`,
    };
  }
  function perform(operation, value) {
    if (!status().available) throw Error(status().message);
    try {
      const result = storage[operation + "String"](value);
      failure = null;
      return result;
    } catch {
      failure = operation;
      throw Error(status().message);
    }
  }
  return {
    status,
    available: () => status().available,
    encryptString: (value) => perform("encrypt", value),
    decryptString: (value) => perform("decrypt", value),
  };
}
module.exports = { configureCredentialStorage, createCredentialStorage };
