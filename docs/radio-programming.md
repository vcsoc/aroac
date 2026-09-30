# UV-5R USB programming — Linux desktop preview

Available in the locally built 0.4.8-preview.1 desktop, not the published 0.4.7 release.

## Validated hardware and limitations

One photographed Baofeng UV-5R (hardware label apparently P51UV), CH340 USB-serial cable, Linux, clone header `aa307604000520dd`, firmware `HN5RV011`. A controlled receive-only slot-127 memory/name write persisted after a manual power cycle; restoring those blocks and power-cycling produced a full 6,472-byte image identical to the original. The general repeater encoder and recovery state machine have simulated tests; **an actual repeater with transmit frequency and tone has not been programmed/tested on the handset**. A matching header is not a unique device serial number or proof of physical model. Do not connect a different handset merely because it answers the same handshake.

Linux requires `/usr/bin/stty` and serial permissions. Optional permission granting uses `/usr/bin/pkexec` and `/usr/bin/setfacl` with the system authorization prompt. ACLs may expire after unplugging. No Java/JDK/.NET is needed. Windows, macOS, iOS and Android USB programming are not implemented or validated; Android remains blocked by the project toolchain requirements.

## Use

1. Power on the same tested radio, seat the cable firmly and close other serial/programming applications. Sign in to your local AROAC profile.
2. Select a map repeater and **Add to radio programming list**. Independently check frequency, signed offset, FM/NFM, current access/operation and licence/local band plan. Provider encode/decode direction is not assumed. Select the correct standard CTCSS transmit tone (or no tone), then mark settings verified. DCS/digital programming is not supported. Receive squelch tone stays off.
3. Open **Radio programming**. Authorize cable access if needed. Click **Inspect empty memories and save full private backup**. This reads twice and refuses inconsistent data or a different signature/firmware.
4. Choose an offered empty memory (0–127). AROAC never overwrites an occupied slot through this workflow. Click the channel's **Program to empty memory … via USB**, review the exact RX/TX, tone and slot, and confirm. Low power is used. Conservative TX limits are 144–148 and 430–450 MHz, but these limits are **not** permission to transmit in your jurisdiction.
5. Keep radio/cable connected until the operation returns. Once instructed, turn the radio off and on. Click **Verify full radio image (read-only)**. Success requires the entire image to equal the original with only the intended two 16-byte channel/name blocks changed. An ACK is never treated as verified success.
6. Do not transmit until verification succeeds. A read can leave the handset in clone mode; power-cycle before normal operation.

Each additional channel requires a fresh inspection and full backup; this is intentionally one channel at a time, not bulk upload. CSV export remains available.

## Interruptions and recovery

The full baseline and pending-write record are saved privately and fsynced before the first write. A failed or missing ACK may still mean a write arrived: **never retry blindly**. Restarting AROAC retains the unresolved operation, scoped to the original profile, and blocks new programming.

Power-cycle and use **Verify** first. If the original full image is intact, no programming remains pending. If only the planned slot is partially changed, **Restore original slot** can write that slot's original bytes after explicit confirmation. Power-cycle again and Verify. Restoration is blocked if unrelated radio bytes changed, the backup failed integrity checks, or the slot contains values other than original/planned bytes. Unexpected states require manual inspection, not repeated uploads. Never upload an entire image to a different handset.

Private backups are under the desktop application-data `radio-backups/` folder (0700, images 0600); pending metadata is `radio-pending.json` (0600). Keep these files until verification is complete. They can contain personal frequencies, names and settings.
