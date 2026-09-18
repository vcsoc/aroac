#!/bin/sh
# Per-user Linux installer. No sudo, Java/JDK/.NET, Node or npm required.
set -eu
case "${1:-}" in
  --help|-h)
    printf '%s\n' 'Usage: sh install-oar.sh [--check]' 'Installs the latest stable vcsoc/oar Linux AppImage and an application-menu entry.' '--check: report the matching release without installing.' 'Requires Linux, Python 3, internet access, and a graphical session to run OAR.'
    exit 0 ;;
  ''|--check) ;;
  *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
esac
if [ "$#" -gt 1 ]; then printf 'Too many arguments.\n' >&2; exit 2; fi
command -v python3 >/dev/null || { printf 'Python 3 is required.\n' >&2; exit 1; }
python3 - "${1:-install}" <<'PY'
import hashlib, json, os, pathlib, platform, re, shlex, shutil, sys, tempfile, urllib.parse, urllib.request

REPO = 'vcsoc/oar'

def fail(message):
    raise RuntimeError(message)

class HTTPSOnly(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, url):
        if urllib.parse.urlsplit(url).scheme != 'https':
            fail('Refusing a non-HTTPS download redirect.')
        return super().redirect_request(req, fp, code, msg, headers, url)

opener = urllib.request.build_opener(HTTPSOnly())
def download(url, destination, limit):
    if not url.startswith('https://'):
        fail('Downloads must use HTTPS.')
    req = urllib.request.Request(url, headers={'User-Agent': 'OAR-Linux-Installer', 'Accept': '*/*'})
    size = 0
    with opener.open(req, timeout=60) as response, open(destination, 'wb') as output:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk: break
            size += len(chunk)
            if size > limit: fail('Download exceeds the allowed size.')
            output.write(chunk)
    return size

def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''): h.update(chunk)
    return h.hexdigest()

def data_root():
    value = pathlib.Path(os.environ.get('XDG_DATA_HOME', str(pathlib.Path.home()/'.local/share')))
    if not value.is_absolute(): fail('XDG_DATA_HOME must be an absolute path.')
    return value

def atomic_file(destination, content, mode):
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.oar-install-', dir=destination.parent)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)

def desktop_quote(value):
    # Desktop Entry string escapes, then Exec argument escapes; no shell involved.
    value = str(value).replace('%', '%%')
    value = ''.join('\\' + c if c in '\\"`$' else c for c in value)
    return '"' + value.replace('\\', '\\\\') + '"'

try:
    if platform.system() != 'Linux': fail('This installer supports Linux only.')
    if os.geteuid() == 0: fail('Run as your normal desktop user, not root or sudo.')
    machine = platform.machine().lower()
    arch = {'x86_64':'x64', 'amd64':'x64', 'aarch64':'arm64', 'arm64':'arm64'}.get(machine)
    if not arch: fail('No supported AppImage architecture: ' + machine)
    home = pathlib.Path.home()
    root = home / '.local/opt/oar'
    launcher = home / '.local/bin/oar'
    data = data_root()
    for p in (root, launcher, data):
        if any(c in str(p) for c in '\n\r\t'): fail('Installation paths must not contain tabs or newlines.')
    with tempfile.TemporaryDirectory(prefix='oar-download-') as scratch:
        scratch = pathlib.Path(scratch)
        meta = scratch/'release.json'
        download(f'https://api.github.com/repos/{REPO}/releases/latest', meta, 2 * 1024 * 1024)
        release = json.loads(meta.read_text())
        tag = release.get('tag_name', '')
        if release.get('draft') or release.get('prerelease') or not re.fullmatch(r'v\d+\.\d+\.\d+', tag):
            fail('The latest release is not a supported stable version.')
        version = tag[1:]
        names = [f'OAR-{version}.AppImage', f'OAR-{version}-x64.AppImage'] if arch == 'x64' else [f'OAR-{version}-arm64.AppImage']
        assets = release.get('assets', [])
        matches = [a for a in assets if a.get('name') in names]
        if len(matches) != 1: fail(f'Release {tag} has no unambiguous Linux {arch} AppImage. Nothing was installed.')
        asset = matches[0]
        print(f'Latest release: {tag} — Linux {arch} — {asset["name"]}', flush=True)
        if sys.argv[1] == '--check': sys.exit(0)
        checksum_name = f'OAR-{version}-SHA256SUMS.txt'
        checksum_assets = [a for a in assets if a.get('name') == checksum_name]
        if len(checksum_assets) != 1: fail('Release checksum manifest is missing or ambiguous.')
        def asset_url(a):
            expected = f'https://github.com/{REPO}/releases/download/{tag}/' + urllib.parse.quote(a['name'])
            if a.get('browser_download_url') != expected: fail('Unexpected release asset URL.')
            return expected
        sums = scratch/'SHA256SUMS.txt'
        download(asset_url(checksum_assets[0]), sums, 128 * 1024)
        hashes = []
        for line in sums.read_text().splitlines():
            match = re.fullmatch(r'([a-fA-F0-9]{64}) [ *](.+)', line)
            if match and match[2] == asset['name']: hashes.append(match[1].lower())
        if len(hashes) != 1: fail('No unique checksum found for the selected AppImage.')
        binary = scratch/'OAR.AppImage'
        print('Downloading and verifying AppImage…', flush=True)
        size = download(asset_url(asset), binary, 1024 * 1024 * 1024)
        actual = digest(binary)
        if size != asset.get('size') or actual != hashes[0]: fail('AppImage size/checksum mismatch. Existing installation was not changed.')
        github_digest = asset.get('digest')
        if github_digest and github_digest != 'sha256:' + actual: fail('GitHub asset digest does not match.')
        # Download the icon from the same release tag; never execute downloaded scripts.
        icon = scratch/'oar.png'
        try:
            download(f'https://raw.githubusercontent.com/{REPO}/{tag}/public/icon-512.png', icon, 2 * 1024 * 1024)
            if not icon.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'): fail('Invalid icon format.')
        except Exception as e:
            print('Warning: using a generic application icon: ' + str(e), file=sys.stderr)
            icon = None
        root.mkdir(parents=True, exist_ok=True)
        # Serialize installer runs without disturbing the application's own instance lock.
        import fcntl
        with open(root/'.install.lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            installed = root/'OAR.AppImage'
            if installed.exists():
                atomic_file(root/'OAR.previous.AppImage', installed.read_bytes(), 0o755)
            atomic_file(installed, binary.read_bytes(), 0o755)
            wrapper = '#!/bin/sh\n# Extraction mode works without FUSE; Electron sandbox remains enabled.\nexport APPIMAGE_EXTRACT_AND_RUN=1\nexec ' + shlex.quote(str(installed)) + ' "$@"\n'
            atomic_file(launcher, wrapper.encode(), 0o755)
            icon_name = 'applications-other'
            if icon:
                atomic_file(data/'icons/hicolor/512x512/apps/oar.png', icon.read_bytes(), 0o644)
                icon_name = 'oar'
            entry = '\n'.join([
                '[Desktop Entry]', 'Type=Application', 'Name=OAR',
                'Comment=Open Amateur Radio — local-first station workspace',
                'Exec=' + desktop_quote(launcher), 'Icon=' + icon_name,
                'Terminal=false', 'Categories=Network;HamRadio;',
                'StartupWMClass=oar', 'StartupNotify=true', '',
            ])
            atomic_file(data/'applications/oar.desktop', entry.encode(), 0o644)
            atomic_file(root/'installed-release.json', json.dumps({'version':version,'sha256':actual,'source':release.get('html_url')},indent=2).encode(), 0o644)
    import subprocess
    for command, directory in [('update-desktop-database', data/'applications'), ('gtk-update-icon-cache', data/'icons/hicolor')]:
        executable = shutil.which(command)
        if executable and directory.exists():
            subprocess.run([executable, str(directory)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    print(f'Installed OAR {version}. Find “OAR” in your application launcher, or run:\n  {shlex.quote(str(launcher))}')
    print('Close an older running OAR before launching. Your application database and settings were not modified.')
    print(f'Rerun this script for the latest release. Previous executable, when present: {root / "OAR.previous.AppImage"}')
except Exception as e:
    print('OAR installation failed: ' + str(e), file=sys.stderr)
    sys.exit(1)
PY
