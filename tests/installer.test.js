import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const file = readFileSync("scripts/install-oar.sh", "utf8").replace(/\r\n/g, "\n");
const linuxOnly = { skip: process.platform !== "linux" && "Linux installer requires Linux filesystem semantics" };
const source = file.split("<<'PY'\n")[1].replace(/\nPY\n$/, "\n");
function run(home, scenario) {
  const setup = `
import io, json, hashlib, os, platform, sys, urllib.request
os.geteuid=lambda:1000
platform.system=lambda:'Linux'
platform.machine=lambda:${JSON.stringify(scenario === "arm" ? "aarch64" : "x86_64")}
sys.argv=['install-oar','install']
fixture_binary=b'test executable only, never launched'
hash=hashlib.sha256(fixture_binary).hexdigest()
base='https://github.com/vcsoc/oar/releases/download/v1.2.3/'
name='OAR-1.2.3.AppImage'
fixture_sums='OAR-1.2.3-SHA256SUMS.txt'
release={'tag_name':'v1.2.3','assets':[{'name':name,'size':len(fixture_binary),'digest':'sha256:'+hash,'browser_download_url':base+name},{'name':fixture_sums,'browser_download_url':base+fixture_sums}]}
if ${JSON.stringify(scenario)} == 'url': release['assets'][0]['browser_download_url']='https://example.org/untrusted.AppImage'
class FakeOpener:
 def open(self, req, timeout=None):
  url=req.full_url
  if url.endswith('/releases/latest'): return io.BytesIO(json.dumps(release).encode())
  if url.endswith(fixture_sums): return io.BytesIO(((('0'*64) if ${JSON.stringify(scenario)}=='checksum' else hash)+'  '+name+'\\n').encode())
  if url.endswith('.AppImage'): return io.BytesIO(fixture_binary)
  raise OSError('No icon in test fixture')
urllib.request.build_opener=lambda *args:FakeOpener()
import shutil
shutil.which=lambda name:None
`;
  return spawnSync("python3", ["-c", setup + "\n" + source], {
    encoding: "utf8",
    env: { ...process.env, HOME: home, XDG_DATA_HOME: path.join(home, "data") },
  });
}
test("Linux installer installs atomically into user paths, preserves a previous executable and leaves app data alone", linuxOnly, () => {
  const home = mkdtempSync(path.join(tmpdir(), "oar installer "));
  try {
    let result = run(home, "ok");
    assert.equal(result.status, 0, result.stderr);
    const root = path.join(home, ".local/opt/oar");
    assert.equal(
      readFileSync(path.join(root, "OAR.AppImage"), "utf8"),
      "test executable only, never launched",
    );
    assert.match(
      readFileSync(path.join(home, "data/applications/oar.desktop"), "utf8"),
      /Exec=".*oar installer .*\/oar"/,
    );
    assert.match(
      readFileSync(path.join(home, ".local/bin/oar"), "utf8"),
      /APPIMAGE_EXTRACT_AND_RUN=1/,
    );
    result = run(home, "ok");
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(path.join(root, "OAR.previous.AppImage")));
    assert.equal(existsSync(path.join(home, ".config/oar")), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
for (const scenario of ["checksum", "url", "arm"])
  test("Linux installer rejects " + scenario + " before installation", linuxOnly, () => {
    const home = mkdtempSync(path.join(tmpdir(), "oar-installer-reject-"));
    try {
      const result = run(home, scenario);
      assert.equal(result.status, 1, result.stderr);
      assert.equal(
        existsSync(path.join(home, ".local/opt/oar/OAR.AppImage")),
        false,
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
