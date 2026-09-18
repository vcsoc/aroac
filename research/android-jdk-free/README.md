# Android without a JDK: investigation, not an OAR port

## Finding

A native ARM64 APK can be compiled, packaged and signed on this Linux machine **without invoking Java, javac, Gradle, keytool, jarsigner, the Java-based apksigner, or .NET**. A small host-side proof completed successfully. This is not a working Android version of OAR and has not been installed or run on a phone/emulator.

The proof uses:

- Existing Android NDK **27.2.12479018**, its LLVM/Clang C++ compiler, and public NDK NativeActivity/native-window APIs.
- SDK Build Tools **35.0.0** `aapt2` and `zipalign`. These particular executables were inspected and are native Linux ELF binaries, not JVM launchers.
- API 35 `android.jar` as **resource-table input** to aapt2; no Java classes are compiled or copied into the APK. The file is an SDK framework archive, not a JDK invocation.
- Host Rust **1.98.1**, the standalone [`apk` 0.4.0 crate](https://crates.io/crates/apk/0.4.0), and a fresh OpenSSL-generated disposable test certificate. `Cargo.lock` pins the resolved dependencies.
- The Rust library's APK Signature Scheme v2 signing and verification, not the full `xbuild` CLI. [The full CLI's documentation lists Java/Gradle tooling](https://github.com/rust-mobile/xbuild/blob/e67b501cbe0e9ca5436c223aa7ec0fe5e27544d1/README.md); it is **not** established here as a compliant build path.

`apk` is a research dependency, not an approved production signing tool: its maintenance/security posture needs review, and verification with the same library that signed a file is not independent Android Package Manager validation.

## Evidence from this machine

- Compiled `libprobe.so` for `arm64-v8a`, with ELF LOAD alignment `0x4000` (16 KiB).
- Built a compiled manifest/resource APK and added the compressed native library.
- Aligned the archive, signed it with a fresh private test key, and verified its v2 signature/content digest using Rust.
- Native `zipalign -c -v 4` passed **after signing**.
- Native `aapt2 dump badging` reported package `org.vcsoc.oar.jdkfreeprobe`, minimum API **24** (Android 7), target API **35**, and framework activity `android.app.NativeActivity`.
- ZIP inspection found only `AndroidManifest.xml`, `resources.arsc`, and `lib/arm64-v8a/libprobe.so`: **no application DEX, `.class`, or Java source**.
- No connected devices were listed by native `adb devices -l`; no emulator was available for this investigation. Installation, rendering, lifecycle/input handling, and real 16 KiB-page-device behavior are **untested**.

Scratch artifact from the investigation:

`/tmp/oar-jdkfree-probe/JDK-free-probe-NOT-OAR.apk`

SHA-256: `e6b7e99b55959226ab46c1f95fdaa404bcdbbaf35ad453251b786d362af2995c`

This disposable probe only attempts to paint three colored bands. It has no OAR interface, account, database, permission requests, or network access. It uses a different application ID and must not be published as an OAR release. Input handling is not implemented; this is a packaging probe, not an interactive application. Its private test key stays outside the repository and must never be used for an OAR release.

## Important distinction: build tooling versus Android itself

Android's OS-provided `NativeActivity` is part of its Java/ART framework. A system WebView also involves Android framework/runtime code. This investigation eliminates **application Java code and host JDK tooling**, not Java/ART from the phone's operating system. If the requirement also forbids using those OS components, this approach does not meet that stricter interpretation.

## Why the current OAR app still cannot simply be put into this APK

The existing renderer relies on Electron's IPC bridge and an owned service using Express, `node:sqlite`, `node:crypto`, filesystem access, session security, backups and feed adapters. Neither NativeActivity nor Android WebView supplies that Node/Electron environment.

Two architecture options need investigation:

1. **Retain React/MapLibre in a system WebView**, created through native/JNI calls to platform APIs. This could preserve much of the UI, but still needs a demonstrated JDK-free lifecycle/keyboard/back-navigation implementation, secure native communication, file/photo selection, external-link isolation and local-origin handling. An ordinary browser view is not enough; callbacks often need platform integration that must not quietly introduce application Java/DEX or a JDK-dependent plugin.
2. **Use an entirely native C/C++/Rust UI** on NativeActivity. This makes the drawing/input path clearer but requires substantial UI redevelopment rather than just APK packaging.

Either path needs a real local application engine and owned persistent SQLite database. Options include a carefully audited embedded JS runtime with native adapters, or porting the service logic to native code. Bundling static HTML or requiring a remotely running account server would **not** satisfy the project requirements. Node's presence on desktop does not establish Android compatibility.

Still required: database migrations, password hashing/session security, offline behavior, provider TLS/network handling, backups/import/export, app lifecycle recovery, accessibility/IME support, WebGL testing if using WebView, and secure production key management/update policy. Android APK updates must follow Android's package-install consent rules; Electron's AppImage updater does not transfer to Android.

## Next gate

Before starting an OAR Android port:

1. Obtain the phone model, Android version and ABI; run a clearly labeled probe on a real device and verify package/signature acceptance and lifecycle behavior.
2. Demonstrate a minimal **owned database + local UI + secure communication** vertical slice, offline and after process restart, using only permitted tooling.
3. Audit the complete build/signing dependency chain and decide whether preserving the WebView UI is practical without Java-based application glue.
4. Only then scope the full port and a separately signed test APK. Keep the legacy Capacitor Android scaffold excluded.

## Reproducing the successful host-side packaging experiment

The files here preserve the proof sources and signing-helper lockfile; no APK or key is committed. Use an isolated scratch directory. Versions/paths below are those actually available on this machine, not an automatic SDK installer.

```sh
SDK="$HOME/Android/Sdk"
NDK="$SDK/ndk/27.2.12479018/toolchains/llvm/prebuilt/linux-x86_64/bin"
BUILD="$SDK/build-tools/35.0.0"
PROBE=$(mktemp -d)
cp native.cpp AndroidManifest.xml "$PROBE/"
mkdir -p "$PROBE/lib/arm64-v8a"
"$NDK/aarch64-linux-android24-clang++" -shared -fPIC -O2 \
  -fvisibility=hidden -fno-exceptions -fno-rtti -nostdlib++ \
  -Wl,-z,max-page-size=16384 "$PROBE/native.cpp" -landroid \
  -o "$PROBE/lib/arm64-v8a/libprobe.so"
"$BUILD/aapt2" link --manifest "$PROBE/AndroidManifest.xml" \
  -I "$SDK/platforms/android-35/android.jar" -o "$PROBE/unsigned.apk"
export PROBE
python - <<'PY'
import os
from zipfile import ZipFile, ZIP_DEFLATED
p = os.environ['PROBE']
with ZipFile(p + '/unsigned.apk', 'a') as z:
    z.write(p + '/lib/arm64-v8a/libprobe.so',
            'lib/arm64-v8a/libprobe.so', compress_type=ZIP_DEFLATED)
PY
"$BUILD/zipalign" -f 4 "$PROBE/unsigned.apk" "$PROBE/probe.apk"
(umask 077; openssl req -x509 -newkey rsa:2048 \
  -keyout "$PROBE/key.pem" -out "$PROBE/cert.pem" -sha256 \
  -days 30 -nodes -subj '/CN=JDK-free investigation ONLY/')
python - <<'PY'
import os
from pathlib import Path
p = Path(os.environ['PROBE'])
f = p / 'signer.pem'
f.touch(mode=0o600)
f.write_bytes((p/'key.pem').read_bytes() + (p/'cert.pem').read_bytes())
PY
# Explicit paths avoid this machine's unconfigured mise cargo/rustc shims.
RUSTC="$HOME/.cargo/bin/rustc" "$HOME/.cargo/bin/cargo" run --locked \
  -- "$PROBE/probe.apk" "$PROBE/signer.pem"
"$BUILD/zipalign" -c -v 4 "$PROBE/probe.apk"
"$BUILD/aapt2" dump badging "$PROBE/probe.apk"
"$NDK/llvm-readelf" -l "$PROBE/lib/arm64-v8a/libprobe.so"
```

The APK hash changes with the newly generated test certificate. Do not invoke `sdkmanager`, Gradle or the usual `apksigner` wrapper for this experiment; they would reintroduce prohibited tooling.

References:
- [Android NativeActivity](https://developer.android.com/reference/android/app/NativeActivity)
- [NDK native activity API](https://developer.android.com/ndk/reference/group/native-activity)
- [APK signature scheme v2](https://source.android.com/docs/security/features/apksigning/v2)
- [Android 16 KiB page-size support](https://developer.android.com/guide/practices/page-sizes)
- [Inspected Rust APK signing implementation](https://github.com/rust-mobile/xbuild/blob/e67b501cbe0e9ca5436c223aa7ec0fe5e27544d1/apk/src/sign.rs)
