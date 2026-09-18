import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import createController from "../desktop/update-controller.cjs";
function fixture(options = {}) {
  const updater = new EventEmitter(),
    history = [];
  let skipped = "",
    checks = 0,
    downloads = 0,
    backups = 0,
    restarts = 0,
    scheduled;
  updater.checkForUpdates = async () => {
    checks++;
    if (options.checkError) throw Error("Network unavailable");
    updater.emit("update-available", { version: options.version || "0.3.11" });
  };
  updater.downloadUpdate = async () => {
    downloads++;
    updater.emit("download-progress", {
      percent: 50,
      total: 100,
      transferred: 50,
    });
    if (options.downloadError) throw Error("SHA512 checksum mismatch");
    return ["/tmp/verified.AppImage"];
  };
  const controller = createController({
    updater,
    currentVersion: "0.3.10",
    supported: () => !options.unsupported,
    supportReason: () => "AppImage required",
    isOffline: () => !!options.offline,
    getSkipped: () => skipped,
    setSkipped: (v) => {
      skipped = v;
    },
    backup: async () => {
      backups++;
      if (options.backupError) throw Error("Disk full");
    },
    publish: (s) => history.push(s),
    restart: () => {
      restarts++;
    },
    schedule: (fn) => {
      scheduled = fn;
    },
  });
  return {
    controller,
    updater,
    history,
    runRestart: () => scheduled?.(),
    counts: () => ({ checks, downloads, backups, restarts, skipped }),
  };
}
test("updater checks without downloading, persists skip, and permits an explicit recheck", async () => {
  const f = fixture();
  await f.controller.check();
  assert.equal(f.controller.getState().phase, "available");
  assert.equal(f.counts().downloads, 0);
  assert.equal(f.updater.autoDownload, false);
  assert.equal(f.updater.autoInstallOnAppQuit, false);
  await f.controller.command("skip");
  assert.equal(f.counts().skipped, "0.3.11");
  await f.controller.check();
  assert.equal(f.controller.getState().phase, "idle");
  await f.controller.command("check");
  assert.equal(f.controller.getState().phase, "available");
  await f.controller.command("later");
  assert.equal(f.controller.getState().phase, "idle");
});
test("updater verifies the download, backs up, then installs and restarts only on consent", async () => {
  const f = fixture();
  await f.controller.check();
  await f.controller.command("install");
  assert.equal(f.controller.getState().phase, "installing");
  assert.equal(f.counts().backups, 1);
  assert.equal(f.counts().restarts, 0);
  f.runRestart();
  assert.equal(f.counts().restarts, 1);
  assert.ok(
    f.history.some((s) => s.phase === "downloading" && s.percent === 50),
  );
  assert.ok(f.history.some((s) => s.phase === "backing-up"));
  await f.controller.command("install");
  assert.equal(f.counts().downloads, 1);
});
test("checksum and backup failures cannot restart or install", async () => {
  for (const options of [{ downloadError: true }, { backupError: true }]) {
    const f = fixture(options);
    await f.controller.check();
    await f.controller.command("install");
    f.runRestart();
    assert.equal(f.controller.getState().phase, "error");
    assert.equal(f.counts().restarts, 0);
  }
});
test("offline, unsupported packages, downgrades and failed checks never offer installation", async () => {
  for (const options of [
    { offline: true },
    { unsupported: true },
    { version: "0.3.9" },
    { checkError: true },
  ]) {
    const f = fixture(options);
    await f.controller.command("check");
    assert.notEqual(f.controller.getState().phase, "available");
    await f.controller.command("install");
    assert.equal(f.counts().downloads, 0);
  }
});
