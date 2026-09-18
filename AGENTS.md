# User development requirements

- **No Java, no JDK, no .NET**, including development/build tooling. The user explicitly confirmed all three prohibitions. Do not invoke Gradle or other JDK-dependent tools, generate Java code, or substitute a framework that still requires these toolchains.
- OAR must be packaged desktop and mobile applications, not a PWA. It must be all-in-one and local-first: the executable owns its local database and application logic. No separate frontend/backend installation, server-address setup, or externally running account service. Network access is for online data and future optional inter-device transport.
- Electron/Node desktop development is permitted. iOS development can proceed without the prohibited toolchains but requires macOS/Xcode for compilation/signing.
- The existing Capacitor Android scaffold and previously built debug APK predate the toolchain prohibition. They are rejected legacy artifacts, not a supported release. Android development is blocked until a genuinely JDK-free approach is demonstrated; do not claim Android readiness.
- Android product target: **minimum Android 16 (API 36)**, responsive on phones and tablets, not device-specific. The intended initial physical test device is the user's Pixel 9 Pro running Android 17. These are requirements, not verified compatibility claims. The native build/signing probe in `research/android-jdk-free/` passed host-side checks only and is not an OAR port.
- Be explicit about native platform dependencies, shared WebView UI, signing requirements and which platforms were actually tested.
