# Optional relay preview (AROAC 0.4.1 desktop)

AROAC still owns its local accounts, SQLite and application logic. A relay is optional transport, never the account service. The 0.4.1 desktop release contains this unaudited preview; historical OAR 0.3.12 does not. Android/iOS transport and native mobile credential storage are not implemented.

## Provisioning

Download `settings.yaml` from your trusted oarsvr administrator. Its schema is:

```yaml
version: 1
relay:
  url: https://relay.example.org
  enrollmentToken: REPLACE_WITH_ADMIN_PROVISIONED_TOKEN
```

Do not commit real enrollment files. On launch, if no relay configuration exists, OAR checks (in order) its application-data directory, the directory containing the actual AppImage, the executable directory, and bundled resources for `settings.yaml`. It does not scan arbitrary working directories recursively. Invalid/oversized files stop automatic import and require manual correction. Only HTTPS origins are accepted: no embedded credentials, URL path, query, fragment or redirects. For explicit local testing, including packaged previews from 0.3.13-preview.2 onward, launch with `OAR_RELAY_ALLOW_LOOPBACK=1` to permit HTTP only on `localhost`, `127.0.0.1` or `[::1]`. The Relay panel displays a warning. The opt-in is required on every launch, including for previously imported settings; restarting without it disables saved HTTP configuration without deleting it. LAN/remote HTTP remains forbidden. HTTP does not authenticate the server or protect enrollment credentials in transit: use disposable credentials. OS-vault requirements are unchanged.

Example local test launch (quit any already-running OAR first):

```sh
OAR_RELAY_ALLOW_LOOPBACK=1 /home/vcsoc/Projects/oar/releases/OAR-0.3.13-preview.2.AppImage
```

Then manually import the administrator's `settings.yaml` with `http://localhost:8080`. HTTPS remains the default when the opt-in is absent.

**Settings → Relay → Import / override settings.yaml** explicitly replaces the shared server setting. It never imports admin passwords. The enrollment file contains a credential: protect/delete your original download when no longer needed. OAR's imported copy is encrypted using the OS credential vault. Importing a file does not contact the relay or register a device.

Sign in locally, then explicitly enable automatic registration/messaging for that profile and server. Initial registration starts on consent; subsequent synchronization runs approximately every 45 seconds while signed in and online. Offline mode and logout cancel pending transport. Each profile/server gets independent Ed25519 signing and X25519 encryption keys. Random local-only SQLite profile scope IDs prevent reused integer account IDs from selecting another profile's encrypted history. The relay never receives these local scope IDs, account passwords, callsigns, email, location records, devices or invoices.

OS-protected key storage is mandatory. Linux `basic_text` is rejected; OAR's optional plaintext *login session* fallback is never reused for relay keys. If the OS vault cannot be used/unlocked, transport fails closed and the local workspace still works. Configuration, identities, peer pins, outbox and retained messages are stored encrypted in owner-only files under `private-relay/` in application data. This does not protect a compromised OS account or application process.

## Peers and messages

In Messages or Settings → Relay, exchange complete device IDs through an independent trusted channel. Look up the peer, compare the **entire** ID, then explicitly pin its keys. A key card has an Ed25519 signature binding its X25519 key to that ID; the client rejects substitutions and changes. An administrator-provided ID alone does not prove a person's identity or radio licence.

Messages use libsodium `crypto_box_seal` (X25519/XSalsa20-Poly1305), plus an Ed25519 signature covering protocol domain, UUID, sender, recipient, recipient key fingerprint, timestamps and ciphertext. HTTP requests are separately signed and bound to server origin, method, exact path/query, body hash, timestamp and random nonce. There are no remote bearer account sessions.

The encrypted outbox is persisted before sending. Retries reuse the same signed envelope/UUID but fresh request nonces. “Accepted by relay” is **not** proof of delivery or reading. Incoming messages are validated, decrypted and persisted before acknowledgement; UUIDs are retained through expiry to deduplicate retries. Unknown or invalid messages are quarantined without displaying plaintext: independently verify the sender, or explicitly discard. A dishonest relay can withhold messages; encryption does not guarantee availability.

Default expiry is seven days minus two minutes, allowing the server's ±90-second request-clock tolerance without exceeding seven-day retention. Keep device clocks synchronized. Local history retains the latest 500 messages, up to 100 queued envelopes and 500 verified peers. Importing another server never grants consent automatically for that server. Disabling relay access retains encrypted local history and keys.

## Security limits and recovery

- This is a new integration, not an independently audited messaging protocol. The primitive implementation is libsodium; do not confuse that with an audit of OAR's integration.
- No forward secrecy/double ratchet, key rotation, group messaging, account multi-device sync, recovery or delivery/read receipts.
- The relay sees IP addresses, device IDs, recipients, sizes, timing and enrollment credentials, but should not receive plaintext message content.
- **SQLite backups do not include relay keys or message history.** OS-vault-bound encrypted files are not a portable recovery mechanism. Losing the device/vault can permanently lose keys/history and requires a new independently verified identity.
- Only the signed-in desktop profile synchronizes. Browser development retains the separate old local-only message fixture; it is not relay E2EE.

## Automatic credential storage (preview.3)

Before Electron initializes, OAR selects Secret Service/libsecret on non-KDE Linux desktops, including Hyprland and Sway. KDE/Plasma keeps Chromium's version-aware KWallet selection. Explicit `--password-store` options are preserved; `basic_text` is always rejected for relay data. Windows retains native account protection and macOS retains Keychain. OAR does not install, unlock or replace OS vaults silently, switch an existing user's backend after decryption failure, or store relay secrets in plaintext.

Settings → Relay shows the selected backend and actionable OS-specific guidance. After unlocking the original vault, use **Retry credential storage** to reload saved configuration/identity without generating new keys or granting consent. If initialization remains unavailable, use **Restart OAR** (save unfinished edits first); launch arguments are retained. Failed reads are not retried by polling. Unreadable settings cannot be overwritten by import. Successfully decrypted settings rejected only by URL policy may be replaced with valid HTTPS settings. Encryption failures leave the previous sealed file intact.

Absent Linux provider: install/enable a Secret Service provider such as GNOME Keyring, or KDE Wallet for KDE. Locked/denied vault: unlock and authorize OAR, then retry. OAR cannot reliably distinguish a locked vault, denied access, a lost key, or corrupt ciphertext; diagnostics must not promise recovery. Keep existing sealed data; never delete it as an unlock workaround. Lost OS keys may make data unrecoverable. Explicit unsupported/basic storage overrides must be removed from the launcher before a full restart.

## Validation

63 automated tests pass, including credential backend/recovery coverage and five cancellation regressions. A confirmed race allowed a late response to consume a queued send after logout, offline mode or vault lock; completion checks now preserve the same envelope for idempotent retry. Received-message tests cover cancellation before decrypt and during acknowledgement, including durable deduplication after restart.

The native UI/live-oarsvr test passes import → cancel/accept consent → enrollment → reject unverified send → peer lookup/pin → queue/send → quarantined unknown sender → verified receive/reply. It gates a real server-accepted send response, logs out through the actual UI, verifies guest isolation and preservation of the queued UUID, then retries after the receiver has acknowledged without duplication. A native process restart restores identity/history. The file chooser and vault are explicit **test fixtures**, and the peer also uses a mocked vault; this is not real OS-keychain persistence coverage. Existing native smoke additionally covers newest-concurrent-login wins.

Playwright normally forces `--password-store=basic` and `--use-mock-keychain`; its `basic_text` result alone says nothing about the host's real vault. The earlier OS-default probe selected `basic_text` on Hyprland even though GNOME Keyring was running. In preview.3, direct Electron probes with OAR's automatic backend policy (no CLI storage override and no mock keychain) selected `gnome_libsecret` and passed real encryption/decryption plus second-process decryption. Both source policy and policy loaded from the packaged `app.asar` passed. Packaged Linux UI smoke passed separately, including diagnostics/retry controls and guest isolation; that Playwright run does not exercise the real vault.

Linux x64 preview.3 AppImage and tarball were built locally, not published. Real Windows/macOS/KWallet, locked-vault interaction, native file-picker automation, and independent security audit remain outstanding. Android/iOS relay transport remains unimplemented; Android tooling restrictions remain unchanged.

Protocol counterpart: `oarsvr/docs/protocol.md`. Local checks can be bounded with `timeout 15s node --test tests/relay.test.js`. Live `tests/relay-interop.js` requires an explicitly disposable server via `OAR_RELAY_TEST_ORIGIN` and an owner-only credential file via `OAR_RELAY_TEST_TOKEN_FILE`; never point it at production. `tests/relay-native-flow.js` exercises the complete native flow; `OAR_RELAY_TEST_MOCK_VAULT=1` explicitly selects its injected test vault, never a production fallback. Its fixture entry point under `tests/fixtures/` is not packaged. Without that flag it removes Playwright's forced storage switches and skips if no secure backend is available. For an uncontaminated availability check, run `tests/relay-vault-probe.cjs` directly using Electron with `OAR_VAULT_PROBE_DIRECTORY` set to an owner-only disposable directory. If secure storage is available, a second direct invocation checks cross-process decryption; delete the disposable directory afterward.
