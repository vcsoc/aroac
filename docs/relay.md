# Optional relay preview (unreleased client source)

OAR still owns its local accounts, SQLite and application logic. A relay is optional transport, never the account service. Published OAR 0.3.12 does **not** contain this new client. Android/iOS transport and native mobile credential storage are not implemented.

## Provisioning

Download `settings.yaml` from your trusted oarsvr administrator. Its schema is:

```yaml
version: 1
relay:
  url: https://relay.example.org
  enrollmentToken: REPLACE_WITH_ADMIN_PROVISIONED_TOKEN
```

Do not commit real enrollment files. On launch, if no relay configuration exists, OAR checks (in order) its application-data directory, the directory containing the actual AppImage, the executable directory, and bundled resources for `settings.yaml`. It does not scan arbitrary working directories recursively. Invalid/oversized files stop automatic import and require manual correction. Only HTTPS origins are accepted: no embedded credentials, URL path, query, fragment or redirects. Explicit unpackaged development can enable localhost HTTP with `OAR_RELAY_ALLOW_LOOPBACK=1`; packaged applications cannot.

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

## Validation

A bounded test phase passed 52 automated tests, a source-run Electron smoke test (bundled transport loads, Relay UI, guest enrollment denial and newest-concurrent-login wins), and real two-client interoperability with temporary oarsvr/PostgreSQL: enrollment, signed key cards, pinned-peer encryption/decryption, persist/ack, retry after ack, encrypted-state restart and profile separation. The interoperability test used a test vault, **not** actual OS keychain persistence. Native enrolled-send/import/consent workflows, logout during an in-flight message transfer, OS-vault restart/unlock and Windows/macOS/mobile remain unverified. No new packaged client release has been published.

Protocol counterpart: `oarsvr/docs/protocol.md`. Local checks can be bounded with `timeout 15s node --test tests/relay.test.js`. Live `tests/relay-interop.js` requires an explicitly disposable server via `OAR_RELAY_TEST_ORIGIN` and an owner-only credential file via `OAR_RELAY_TEST_TOKEN_FILE`; never point it at production.
