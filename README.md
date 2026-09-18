# OAR · Open Amateur Radio — standalone desktop

**One installed application, its own local SQLite database, no server setup.**

## License

OAR is **source-available, not open-source**. Free noncommercial use and sharing
of unmodified copies are permitted under the [OAR Free Noncommercial Use License](LICENSE).
Code modifications and any commercial use of all or part of OAR require prior
written consent from Chris Visser ([vcsoc](https://github.com/vcsoc)). Third-party
components retain their own licenses. Future versions may use different terms;
see the license for details.

## Version 0.3.12

- Signed-out account menu, a tutorial Help shortcut after Quick Switch, expanded About information, supplied OAR branding and refreshed Linux/Windows/macOS/iOS icon assets. Linux, Windows x64 and macOS ARM64 packages have been built for this release.
- Camera button saves the application view to Pictures as `oar-screenshot-YYMMddHHmmss.png`; images can contain private information.
- Uniform monospace License typography, collapsed third-party notices, thin themed scrollbars shown only during scrolling, small-text scaling, and consolidated Login help.
- The comparison timeline follows the theme. Escape no longer adds an orange keyboard-focus border to the map.
- Account-owned locations, contacts, corrections, preferences, search and transfers; General remains shared. Editing General while signed in makes a private copy. Expired sessions cannot silently save private work into General. Devices/invoices remain account-owned.

### Existing data and privacy

Ownership migrations are transactional and preserve records. A permission-restricted `backups/before-profile-ownership-*.sqlite` snapshot is made before migrating a legacy on-disk pin database. With no profiles, legacy unlabelled locations/contacts remain General; with one profile, they become private to it. With multiple profiles, ambiguous old records and home settings are preserved in locked owner `-1` scope, invisible to normal application reads. **There is not yet an in-app recovery screen:** close OAR, retain the migration backup, and ask for per-record recovery assistance; do not assign ambiguous records wholesale to General. No records are deleted by ownership migration.

This is application-level access control, **not encryption**. The OS user/admin can read SQLite, screenshots and backups. Profile display name/callsign/grid/biography remain available to signed-in local operator-directory searches. Full SQLite export is restricted to signed-in, single-profile installations; multi-profile users have scoped JSON/ADIF exports, but no in-app full device/invoice export yet.

## Version 0.3.11

- Repeated map-location saves check current saved coordinates and ask before creating a duplicate; overlapping saves are blocked. Confirmation dialogs focus Cancel by default, with Enter/Space activation and normal Tab navigation to Confirm.
- The top-right profile circle shows your saved photo, including immediate upload/removal updates and restoration after sign-in.
- All toast notifications hide within six seconds (ordinary status toasts still use four seconds). Hiding update progress does not cancel a consented update; Check for updates can reopen its notice.
- Sources YAML wraps without horizontal scrolling, has muted line numbers aligned with wrapped lines, and uses the left panel's narrow, themed, scrolling-only scrollbar. Settings' outer scrollbar is hidden; the Sources editor fits inside the dialog.
- Theme color controls use a compact, thin-bordered three-column grid at normal Settings width, adapting to narrower windows.

## Version 0.3.10

- Startup update checks and **Callsign → Check for updates**. A persistent update toast offers Update and restart, Later, or Skip this version; explicit checks can re-offer a skipped version. Downloads use the matching OS/architecture/package metadata and SHA-512 integrity verification. Before installation OAR backs up SQLite and `sources.yaml`; Linux also keeps a hidden executable recovery copy beside the AppImage. Install 0.3.10 manually to bootstrap updates from older versions. Linux AppImage updates are distro-independent; tar archives, distro packages and development runs cannot self-install. Windows NSIS and macOS updater code remains untested here and needs appropriately signed, tested platform assets. No newer production version was available for a live end-to-end upgrade during this release's testing.
- **Settings → Sources** edits the per-user `sources.yaml`. The repository YAML supplies defaults for supported weather/forecast, radar, MUF, repeater, geocoding, map and observation adapters. `countries: ['*']` covers every country; compatible country-specific entries take priority, followed by global fallbacks. This is not an exhaustive worldwide provider directory and arbitrary API formats need new adapters. Weather routes by requested coordinates; other feeds/maps use home country. Boundaries are approximate (country-coder); users can manually choose their mobile country.
- Source edits are syntax/schema checked before activation, direct file edits are polled, and the last valid configuration is retained in SQLite. Invalid edits offer Reset config / Ignore. Reset downloads the fixed GitHub `main/sources.yaml`; offline, unavailable or incompatible remote content falls back to bundled defaults. Compatible endpoints use public HTTPS hosts, bounded responses and no redirects; credentials/private hosts are not supported. Keep provider attribution and comply with provider terms. Map sources refresh immediately and active data feeds reload after configuration changes. Feed adapters try country-specific endpoints followed by global fallbacks within their request timeout; map layers select the first matching configured endpoint and report tile errors.
- Quick Switch help uses top-layer tooltips. About includes License, developer-profile and GitHub links, dependency/font licenses, and access to bundled Chromium notices.
- Private profile contact fields reveal on focus or hover. Country flags/calling prefixes default from known home coordinates. The optional mobile field uses the requested **10-digit** local `###-###-####` format (not a universal international-number validation rule); email is optional and syntax-checked. Masking is display-only, not encryption.
- Selected-location headers have Save and temporary Pin controls, with expand/collapse beside each title. Up to 20 cards can be temporarily pinned while subsequent map clicks add another selection. Cards close independently; temporary pins are not saved across restarts.

## Version 0.3.9

- Action notifications are themed toasts that fade out after four seconds. Saved-location and home changes identify what changed instead of saying “Saved locally.” Field validation and feed/offline status remain visible where needed.
- **About OAR → Roadmap** fetches `https://raw.githubusercontent.com/vcsoc/oar/main/roadmap.md` only when opened. It renders safe Markdown without raw HTML or remote images. Offline, missing, oversized or unreachable content shows a contribution/sponsorship invitation instead. The repository file must be published on `main` before the live roadmap can load.
- **Callsign → Help → Tutorial** starts a 13-step guided tour with highlighted sections and Previous, Next and End controls. End/Escape restores the previous workspace view; the tour does not edit saved records.
- A persistent bottom status line shows the installed package version on the left and station callsign/grid on the right.
- Clock editors use a compact color swatch beside the foreground-color title and an icon-only “Use theme color” reset. Location, timezone, color and coordinate explanations are question-mark tooltips beside their headings.

### Interface updates included

- Saved-location cards group Move, Home and Delete on the right. Delete is available without entering edit mode and requires confirmation.
- App confirmations and About OAR use themed dialogs. The callsign opens an Edit Profile / About OAR / Logout menu.
- The topbar uses a left-panel toggle, left-aligned workspace breadcrumb and compact search that expands on focus. About OAR credits Chris Visser and links to this repository.
- Routine location, map, clock and settings explanations use keyboard-accessible question-mark tooltips. Location source attribution is included in help; errors, stale-data indicators and security warnings remain visible. Local time appears beside the province/country row.
- Windows and macOS use frameless windows with custom topbar controls (right on Windows, left on macOS); Linux retains its native frame. Windows/macOS native behavior still requires testing on those platforms.

Version **0.3.8** changes custom clock colors to **foreground text** while retaining theme backgrounds, with a subtle contrasting text outline. It redesigns the profile form with circular image/placeholder avatars. Left-panel cards focus the map on single click; double-click anywhere on the title area toggles the card independently without navigation. Each card has a set-home icon (disabled without coordinates), and Home no longer has a Change button. Selected locations show live local time, IANA timezone and current DST-aware difference from home. Map/pin context menus can add the exact point as an additional toolbar clock (up to 24), without changing home.

Version **0.3.7** added source/destination link planning, theme-independent contrasting custom clock colors, pin-hover tooltips/highlights, a logged-in user panel, private profile/avatar/password editing, equipment/invoice records and local ownership PDF export. It also fixes sidebar alignment, compact icon actions, unclipped alphabetical/timezone menus, responsive forecasts, and a context-menu/marker interaction that could leave a phantom drag active. **Link planning is not terrain-verified line of sight or a guaranteed operating configuration.**

Version **0.3.6** added read-only saved-location/contact cards with per-item edit controls; saved contact-name search; live weather/time/day-night/home-time differences; alphabetical ordering and callsign/timezone grouping; independent item/group collapse controls; persistent home-detail/weather/forecast sections; and narrower, full-row Quick Switch toggles. The link-planning section gives short-path distance/bearing and reference bands, **not path-specific tuning predictions**.

Version **0.3.5** added independently resizable, remembered side-panel widths; thin theme-colored scrollbars shown only while scrolling; a uniform single-column Quick Switch; a left-aligned Remember my callsign slider; and the location-details icon at the far left of the top bar before Workspace.

Version **0.3.4** added the top-bar **Quick Switch** popover (all eight map switches), selection without auto-opening the contacts drawer, real provider-modeled MUF contour lines alongside station points, remembered callsigns, and opt-in restart sign-in persistence. Process-only sign-in is the default; passwords are never saved. See the sign-in section below for the explicit unencrypted-token fallback when no OS secret store is available.

Version **0.3.3** fits Overview/World atlas to the window, adds a map Home button and Flat map/Globe slider switch, links grey-line shading to the clock slider (optional), moves Settings into a tabbed modal, and widens home/selected weather into matching two-column details with forecast icons. A new MUF toggle displays geolocated ionosonde observations, not interpolated global contours.

Version **0.3.2** fixed right-panel navigation: clicking a saved-location or contact title now focuses the map. Address-book contacts use a unique saved pin with the same callsign, otherwise a valid grid’s explicitly approximate centre; contacts without a known location show a message rather than a guessed position. Editing fields does not move the map.

Version **0.3.1** fixed the clock editor/search layout and adds offline search over 235,822 GeoNames cities/towns, explicit city-versus-timezone details, zoom-dependent city labels, saved-pin address corrections, weather slider switches, top-bar map controls with a radar legend, larger adjustable text, and persistent app zoom. Version 0.3.0 added editable world/home clocks, a shared comparison timeline, home/selected-location weather with seven-day forecasts, pinnable side panels, street labels, repeaters, draggable saved locations, an address book, live theme editing and YAML/JSON import/export. Specialist tools now open inside the installed application. The Linux AppImage includes the interface, database engine and application logic. Double-click it to run; no system Node, npm, browser, server or server address is needed.

## Linux release

### Install into your Linux application launcher

Close any running OAR, then install the latest Linux release:

```sh
curl -fsSL https://raw.githubusercontent.com/vcsoc/oar/main/scripts/install-oar.sh | sh
```

This executes repository code; download and review the script first if preferred. From a checkout, run `sh scripts/install-oar.sh`.

Use `sh scripts/install-oar.sh --check` to check the latest release without installing. The script requires Python 3 and internet access, selects a matching published AppImage, verifies its SHA-256 against the release checksums (and GitHub's asset digest when available), and installs it per-user at `~/.local/opt/oar/OAR.AppImage`. It creates `~/.local/bin/oar`, a desktop application entry and an icon. No sudo, Node, npm, Java/JDK or .NET is needed. The launcher uses AppImage extraction mode, so FUSE is not required; Electron's sandbox is not disabled. Existing OAR settings/databases are untouched. Re-running the script updates the installation and retains the previous executable. Missing architecture-specific assets or failed verification stop installation. Release checksums establish download integrity, not independent code-signing identity.

### Manual download

Download the AppImage, Linux archive and SHA-256 checksums from
[GitHub Releases — v0.3.12](https://github.com/vcsoc/oar/releases/tag/v0.3.12).
Release binaries are distributed as release assets, not stored in Git history.

```text
releases/OAR-0.3.12.AppImage
```

Make executable if your download manager removes that permission, then double-click. If FUSE is unavailable, run the AppImage with `--appimage-extract-and-run`. The older 0.1.0 files are obsolete client/server prototypes, not the standalone release.

## Windows x64 release

[GitHub Releases — v0.3.12](https://github.com/vcsoc/oar/releases/tag/v0.3.12) includes
`OAR-Setup-0.3.12.exe`, its blockmap, Windows update metadata and SHA-256 checksums.
Built on Windows 11: 44 unit tests passed; four Linux installer tests were skipped.
The packaged desktop, update/source/license and screenshot/backup-protection smoke tests passed.
The installer is unsigned; the installer wizard and end-to-end automatic upgrade were not tested.
POSIX permission assertions do not validate Windows ACLs. The Electron package includes
Chromium, Node and SQLite; no separate runtime or server installation is needed.

## macOS Apple Silicon release

[GitHub Releases — v0.3.12](https://github.com/vcsoc/oar/releases/tag/v0.3.12) includes
`OAR-0.3.12-arm64.dmg`, `OAR-0.3.12-arm64-mac.zip` and macOS SHA-256 checksums.
This standalone Electron application bundles its Chromium interface, local SQLite
and application logic; no separate server or system Node installation is needed.
Intel Macs were not built or tested.

Built and tested on macOS 26.5.2 (Apple Silicon). The unit suite passed 44 tests
with four skipped and no failures. Packaged desktop (offline accounts, persistence,
backup and map controls), guidance, and release-twelve (native screenshots and
signed-out backup protection) smoke tests passed. DMG and ZIP integrity checks
passed. The extended
release-ten smoke test did not pass: after canonicalizing macOS's temporary path,
it failed opening bundled Chromium license notices. The DMG installation workflow
and automatic updates were not tested.

This build is not Developer ID signed or notarized; Gatekeeper may block opening
it. macOS automatic-update metadata is deliberately not published for this
manual-install build. Packaging includes the OAR application icon.

## Workspace controls

- **Clocks:** double-click any clock (or focus it and press Enter) to change its city/timezone. **Add clock** adds another, up to 24 additional clocks. The home clock always says **Home Location Time**. Add/edit dialogs offer a **Clock color** foreground; the selected text color persists across themes, with a subtle contrasting outline and unchanged theme backgrounds. **Use theme color** removes the override. Colors are saved with each clock, including home. Its initial timezone comes from your device; precise coordinates are not guessed. Search a place or use the optional device-location button to configure home weather. Device positioning may be unavailable on Linux; address/coordinate search is the fallback.
- **City/timezone accuracy:** type a city directly in the timezone field for offline suggestions, including alternate names and country/region disambiguation. Focusing/clicking that field selects its current value. The bundled GeoNames cities500 directory covers towns above 500 people and administrative seats, not every settlement. City coordinates are centroids, not street addresses. Durban correctly uses the shared IANA timezone **Africa/Johannesburg**; **Africa/Durban does not exist**. Map details show a separate mapped city/place name; offline fallback explicitly identifies the nearest mapped place and its distance, not an administrative boundary.
- **Time comparison:** drag the slider below the clocks, from one day ago to seven days ahead in 15-minute steps. All clocks represent the same shifted instant, including DST/date changes. **Now** returns to live time. Calculated grey-line shading follows the comparison time by default; turn off **Quick Switch → Grey line follows clock slider** to keep shading live. It does not change the system clock or shift weather, radar, ISS or MUF observations.
- **Map settings:** the gear opens a modal with **Map, Login, Appearance, Themes, Data and Account** tabs. The **Quick Switch icon beside the gear** slides out a compact top panel with identical, vertically aligned slider rows containing Grey line, Radar, MUF, time-zone meridians, street names, city names, repeaters and clock/grey-line linking. Click anywhere on a switch row to toggle it; the panel is now 280 px wide. Click outside, press Escape or use its close button to dismiss it. City label density increases with zoom; a searched-place label persists at its coordinates until you clear the search. Double-tap Escape (within 650 ms) to return the current map/globe to a whole-world overview; this is disabled while an edit dialog is open. Street names appear at city/street zoom. Repeaters cluster when zoomed out; clicking a cluster zooms in, and clicking an individual repeater shows all supplied provider fields. Overlapping repeaters have a selector. Coverage is not exhaustive; verify details before transmitting. Cached directory data works offline, including bundled Latin cluster glyphs.
- **Map controls:** Overview and World atlas size the map to the remaining window height. Flat map/Globe is a two-position switch. The **Home icon below +/−** returns to configured home coordinates; if unset, it opens the home editor without guessing. Grey line, Radar and MUF are slider toggles inside Quick Switch with explanatory tooltips. Enabling radar displays the RainViewer Universal Blue reflectivity legend (dBZ), snow key, frame timestamp and cached/error status. Higher dBZ indicates stronger echoes, not a direct rainfall rate. Coverage gaps do not prove clear weather.
- **MUF points and contours:** the MUF switch adds KC2G/GIRO ionosonde points and the provider’s georeferenced modeled contour lines to both projections. Contours have MHz labels and contrasting outlines; they are not lines joining measured points. Click a dot/label for its station, UTC observation time and confidence. This is **MUF(3000 km)**, not a guaranteed usable frequency for a particular contact. Modeled areas far from stations can be less reliable. Only observations from the last 24 hours are plotted; gray/asterisk points flag cached data, age over 90 minutes, or low/unknown confidence. Contours have separate publication/download times (publication is not measurement time); cached/old or unknown-publication-time lines are dashed. Both feeds refresh/cache independently for five minutes in SQLite only while enabled. Failures fall back to explicitly stale cached data; missing contours are explained without fabricating lines. The clock slider never forecasts MUF. Attribution and details are in the expandable map legend.
- **Text and zoom:** text defaults to 112% of the previous size. Settings → Appearance → Text & app zoom provides a live 90–160% text preview with Apply, plus persistent 60–200% whole-app zoom. **Ctrl+ / Ctrl−** adjust app zoom, **Ctrl+0** resets it. App zoom also works while an embedded specialist view has focus. Map/geographic zoom remains separate.
- **Saved locations:** right-click map/globe to save a pin; click a pin to show its left-panel details, drag to move, or right-click for actions. Clicking a pin never opens a closed contacts/locations drawer; an already-open drawer highlights the selected saved location. Explicit creation/edit actions can open its editor. The address/pin icon beside the gear toggles the locations/address-book panel. Saved items are read-only by default; the pencil opens the existing editable form, and saving returns to read-only mode. New-pin creation and explicit map-menu editing open the editor immediately. Pins now have a separate optional contact name, retained in SQLite and JSON transfers. The home, save and move actions are icon buttons with tooltips. Signed-in saves are private to that profile; signed-out saves belong to **General**, visible in either session state. Editing a General record while signed in creates a private copy and leaves the shared original unchanged. **Use this pin as home location** uses its exact saved coordinates; the clock editor can also select saved-pin coordinates. Search results may be approximate: the left panel offers **Correct this address using a saved pin**. This stores a reversible, device-local correction for that query, follows subsequent movement of that pin, and does not edit the provider’s database. **Restore provider position** removes it.
- **Saved-card controls:** single-click a title to locate it; double-click to expand/collapse its item (or use the chevron). The top ordering icon selects callsign, contact/location name or group, ascending/descending. Toggle group headers and choose **Alphabetical** (contact/location name, falling back to callsign: 0–9, A–Z, or # for other initials) or **Timezone** grouping; unknown timezones are explicitly grouped as unknown. The dropdown panels float outside the scroll container, so collapsed groups do not clip them. They have no Done button; click outside, toggle their toolbar icon or press Escape. Groups are ordered first when headers are shown, then items within them. Double-click a group heading (or use its chevron/keyboard activation) to expand/collapse that group. Expand/collapse-all affects items, not group visibility. Ordering, grouping and collapse preferences are remembered locally.
- **Source/destination planning:** right-click any actual flat-map/globe point or saved pin and choose **Set as source location**. Right-click a destination and choose **Analyse link from source**. The right panel shows coordinates, approximate great-circle distance and initial true bearing. Enter both antenna heights above local ground to estimate smooth-Earth optical and nominal 4/3-radius radio horizons. Heights reset when their endpoint changes; they are never guessed. There is **no terrain/elevation, building, vegetation or Fresnel-clearance survey**, so terrain-verified LOS remains unknown. Band references and conditional voice-mode/polarization examples are planning options, **not dial frequencies, path predictions or permission to transmit**. Confirm equipment, licences, local band plans and a clear agreed operating frequency. Source/destination choices are session-only and do not alter saved pins or home.
- **Pin hover:** hovering or keyboard-focusing a saved marker shows a theme-colored tooltip with names/callsign, coordinates, grid, timezone and notes. Corresponding displayed left/right items and group headers highlight without opening a closed panel, replacing a selection or expanding groups. Covered globe markers cannot intercept pointer events. Right-clicking a pin cannot start a drag.
- **Contact context:** expanded read-only cards show Open-Meteo current estimates with icons and cached/stale status, live local time with calculated sun-above/below-horizon icons, IANA timezone and the current DST-aware offset from the home clock (including fractional-hour offsets). These clocks remain live independently of the comparison slider. Weather loads for visible expanded cards and refreshes every 15 minutes; missing weather is explained. Address-book locations use one callsign-matched pin, otherwise a valid grid centre explicitly marked approximate; missing/ambiguous locations never get guessed coordinates or timezones. Link planning calculates approximate short-path distance and initial true bearing when home coordinates are set. The HF MHz/Hz values are **band references, not dial frequencies or propagation predictions**. No path-specific band/mode/power predictor is installed; verify both licences, local allocations, antennas, a clear agreed frequency and propagation before transmitting.
- **Location/weather panel:** home always appears first, above the selected location. Its whole card, location details, current weather and forecast can be independently collapsed; these choices survive restarts. Click the map or select an address to show selected-location details below home details on the left. Both locations use the same details and weather layout; home requires configured coordinates, not just a device timezone. The left panel uses two columns of weather facts. Three forecast days share a row when space permits; seven use three cards then four, falling back to narrower arrangements as the panel shrinks. Condition-matched icons remain visible. Selected-location Save and station-location actions are icon buttons with tooltips; its close icon removes that selected card without removing home. It includes coordinates/grid/timezone, temperature/feels-like, humidity, wind/gusts, pressure/cloud/visibility/dew point, sunrise/set and 3- or 7-day forecasts. Use the °C/°F and 3-day/7-day two-position slider switches; wind shows km/h and mph. Open-Meteo supplies model estimates, not a guaranteed nearby station observation. Cached results are explicitly marked when stale/offline. The location icon at the far left of the top bar (before Workspace) reopens this panel. Both panels have pin buttons; unpin before closing. Drag each panel’s inner edge to resize it; widths are saved independently across restarts and temporarily limited to fit smaller windows without overwriting your preference. Keyboard-focus an edge and use Left/Right arrows (Shift for larger steps), Home/End for limits, or double-click to reset. Side-panel scrollbars are 4 px wide, theme-colored, and invisible until scrolling; they hide again after 800 ms of inactivity. On narrow map layouts the side panels overlay the map rather than pushing it offscreen.
- **Themes:** Settings → Themes provides native color pickers, hex fields, a component preview and live preview across OAR. **Apply theme** saves to SQLite; leaving the tab or closing Settings without applying reverts the preview. Import/export uses versioned YAML files; imported colors are previewed before applying. External imagery/websites retain their own appearance.
- **Locations/contacts transfer:** Locations, Contacts, Export and Import are icon buttons on a shared toolbar, followed by a question-mark transfer tooltip. Export/import versioned OAR JSON through native file dialogs in Settings → Data or Saved locations. Exports include General plus only the current profile’s pins/address-book contacts and, when signed in, that profile’s QSO logbook and legacy saved local operator contacts. Import previews counts, merges records atomically and skips exact duplicates; importing QSOs is explicitly optional and requires sign-in. It never creates accounts or imports passwords/sessions. Imports accept up to 10,000 records per category and an 8 MB file. Full SQLite backup requires sign-in and a single-profile database, because it contains every profile’s data.
- **Specialist views:** Conditions opens MUF, lightning, shortwave, satellite, solar and radar provider websites inside a sandboxed, separate-session desktop browser view. No Node, preload bridge, local database access, downloads or device permissions are granted to these sites. Main-frame navigation is restricted to the selected provider. Internet and provider availability are required; these are interactive external tools, not locally ingested feeds. Browser-development previews use frames and may be blocked by providers. Attribution/reference links still open the system browser.

Close an older running OAR before launching the new AppImage. Existing station databases are preserved.

## Profile, equipment and ownership documents

Click your callsign in the top-right corner for the **Logged in user** panel with avatar, **Edit profile** and **Logout**. The editor has first/last names, display name, mobile, email, address, optional grid and biography. Click/drop a PNG/JPEG avatar (up to 4 MiB, bounded image dimensions); it is resized to at most 512 px and stored in SQLite. Password changes require the current password plus matching 12–128-character new passwords. Other sessions are revoked; the current session stays signed in. Passwords are still salted/scrypt-hashed, never stored in profile metadata or PDFs.

**Edit profile → My devices** supports up to 500 devices with manufacturer/model, serial, purchase date/price/currency, supplier contact/address, warranty expiry and free-form specifications/notes. Attach up to eight original PDF/JPG/PNG invoices per device (4 MiB each; raster images at most 40 megapixels). Files are stored unchanged as SQLite blobs and deleted with their device. Use the full SQLite backup to preserve them: ordinary locations/contacts JSON transfers deliberately exclude private account/device/invoice data.

Export one device or all devices to a locally generated **PDF ownership record**. It contains account/device details, original invoices as embedded file attachments, and a UTF-8 JSON snapshot. PDF invoices are **attachments, not flattened invoice pages**: use an attachment-capable viewer to retrieve them. Image previews are orientation-corrected and normalized to JPEG (at most 3,000 px on the long edge), while originals remain unchanged. Previews use bounded decoding limits (16 MP per image, 32 MP total); larger/unsupported previews are omitted with an explanation, while originals remain attached. Each export permits up to 32 MiB of original attachments; use per-device reports for larger inventories. Bundled Noto Sans supports Latin/Greek/Cyrillic text; unsupported glyphs are spelled as Unicode code points and the JSON attachment preserves original text. Reports are **owner-entered records, not certified proof or guaranteed warranty coverage**. Review private fields and original attachments before sharing.

These routes are account-scoped in the UI/API, not an encryption boundary. Display name/grid/biography appear in the local operator directory; other profile fields, avatars, devices and invoices do not. Anyone with the OS-user account or a full database backup can read the unencrypted data. On Linux, the application database/journals and native PDF exports use owner-only file permissions.

## Local-first behaviour

- Create callsign profiles, sign in, edit station details and manage your QSO logbook without internet. Maidenhead grid is optional; leave it blank if unknown. No station location is guessed.
- OAR creates `station.sqlite` in its per-user application-data directory, normally `~/.config/oar/` on Linux. The exact location is shown in **Settings → Data**.
- Records survive app restarts. Nothing is stored alongside the AppImage, so replacing the executable does not replace the database.
- **Back up database** creates a consistent SQLite snapshot through a native save dialog, only when signed in on a single-profile database. Multi-profile users must use scoped JSON/ADIF exports; full device/invoice backup for multi-profile installations is not yet exposed in the UI. The database and backups are not encrypted; protect your device and backup files.
- **Work offline** disables OAR’s external imagery/feed requests. Profiles and logbook remain usable. Saved observations are returned with stale/offline labels; uncached imagery is unavailable.
- There is no automatic cloud upload or cross-device synchronization.
- Passwords are salted/scrypt-hashed and never saved by the login UI. The left-aligned **Remember my callsign** slider below the callsign field remembers only the callsign on this device. By default, desktop sign-in survives navigation/reloads but ends on sign-out or application quit. **Settings → Login → Keep me signed in across restarts** opts into restoring the local session without a timed expiry until manual sign-out; disabling it removes the stored token but keeps the current process signed in until quit. This is local session memory, not third-party identity-provider SSO.
- Persistent tokens use the OS secret store when available. Otherwise the app requires explicit confirmation before saving an **unencrypted bearer token** in `local-session.json`, restricted to the OS user (0600, atomically replaced). Anyone able to read that token can access the local profile; enable only on a trusted/protected device. No plaintext password is stored. Sign-out revokes the database session and clears stored tokens; startup revokes abandoned process-only sessions. The SQLite database itself is not encrypted.

Profiles are local to the installation. Callsign ownership is self-declared, not verified by a licensing authority. Password recovery is not implemented. Accounts made in the old external-server prototype are not automatically imported into this local database.

## Implemented desktop features

- Local operator profiles and QSO logging with UTC date/time, callsign, MHz frequency, mode and notes.
- Native ADIF export and SQLite backup; logbook UI/export currently includes the latest 5,000 contacts.
- Interactive globe and flat Mercator world map, optional Maidenhead station marker, geographic timezone selection, DST-aware clocks and a Quick Switch slider for nominal 15° time meridians/UTC offset labels, inspired by Meridian. These meridians are not political timezone boundaries.
- Top-bar search first looks for saved contact names, location names and callsigns in the local database, including offline. Matching saved queries do not automatically go to an online provider; **Search online places instead** explicitly sends that query. A located result navigates the map without opening a closed right drawer; an unlocated contact opens its address-book item and explains the missing location. When no saved item matches, physical-address/place search uses Photon/OpenStreetMap. Suggestions appear after a short typing pause; Go or Enter also submits. Choose a result to move the map/globe, mark the location and display its actual timezone. Address coverage varies; verify the returned address. Unmatched address queries are sent to Photon after a 450 ms pause and cached in the local database; the clock timezone/city field searches the bundled directory locally instead. Latitude, longitude searches work offline; cached address results also work offline.
- Select **Use approximate location for my station** on a selected location to calculate and save your grid automatically. Searching alone never changes your station location.
- MapLibre's worker is bundled locally, so timezone lines and calculated night shading work without downloading worker code. Globe mode resets to a whole-Earth overview; address searches zoom in to the selected location.
- Calculated grey line, NOAA Kp and solar flux, ISS position/altitude, RainViewer radar overlay, with provider attribution and stale/error states.
- NOAA D-RAP, US radar, North American/Great Lakes satellite panels.
- Lazy-loaded map rendering and responsive interface; bundled UI works without downloading a website.

Maps/imagery and new observations normally require internet. The saved feed cache is in the local database. Meridians are not political timezone boundaries; polar Mercator coverage ends at ±85°. OAR is not a safety-critical weather service.

## Not complete yet

- **Inter-operator messaging:** a local database cannot deliver messages to other installations. Peer-to-peer/relay transport and discovery are not implemented. The standalone UI explicitly says so; it does not pretend local records are online deliveries. Legacy messaging API/UI remains only in development tests.
- **Mobile:** not a release. The old remote-server mobile approach is disabled rather than presented as a standalone implementation. iOS still needs a local SQLite adapter and testing on macOS/Xcode. A [JDK-free native APK packaging/signing probe](research/android-jdk-free/README.md) passed host-side checks, but it is not OAR and has not run on a device. Android remains blocked pending device validation and a compliant local-engine/UI implementation.
- Specialist provider tools are embedded websites, not native/local feed integrations; website failures, login requirements and provider restrictions still apply.
- No HF prediction engine, ISS pass/orbit predictions, rig control, push notifications or cloud sync.
- Windows x64 NSIS packaging has been built on Windows 11, and the packaged application passed the desktop smoke test (offline accounts, SQLite persistence across restart, backup and map controls). The installer wizard itself has not been tested. macOS ARM64 packaging and basic packaged-app tests passed; see the macOS release section for known test failures and installation limitations. Signing and notarization are not configured. Linux AppImage updates are supported from 0.3.10 onward; other platform installers/update flows require target-platform validation.

**No Java, no JDK, no .NET**, including development tooling. Legacy Android files are rejected prior work; do not build or distribute them.

## Implementation

Electron’s main process owns SQLite and the embedded data service. The service is bundled into `desktop/generated/local-service.cjs`; it is not another application or a spawned backend process. It uses an ephemeral loopback-only port as internal transport, protected by a per-launch random capability that never reaches the renderer. No fixed port, remote server, address prompt or manual startup is involved. The renderer uses a restricted preload/IPC bridge, with Node integration disabled and context isolation/sandboxing enabled.

Closing OAR shuts down the internal service and database. macOS retains the usual app-until-Quit behaviour. One instance per application-data directory is permitted.

Online data comes from public providers, not an OAR account server. External providers receive normal network requests; no telemetry/analytics are installed.

## Development and release build

Development requires Node 22.13+ (24 LTS recommended), not Java/JDK/.NET. End users do not need Node.

```sh
npm ci
npm run build
npm start                         # self-contained Electron application
npm run desktop:dev               # desktop with UI hot reload
npm run desktop:build -- --linux AppImage
npm run desktop:build -- --win --x64 # Windows: releases/OAR Setup 0.3.12.exe
CSC_IDENTITY_AUTO_DISCOVERY=false npm run desktop:build -- --mac --arm64 # unsigned macOS DMG/ZIP
```

Before packaging a fresh checkout, generate the offline city directory: download and extract `cities500.zip` and download `admin1CodesASCII.txt` from https://download.geonames.org/export/dump/, then run `node scripts/build-cities.js /path/cities500.txt /path/admin1CodesASCII.txt`. The generated `data/cities.json` and attribution file are ignored by Git but included in the package.

Build on the corresponding platform for Windows NSIS or macOS DMG/ZIP. The generated embedded service is bundled with esbuild, so the packaged application does not rely on a system Node installation or external server packages.

For shared-interface browser testing only, `npm run dev` retains a development harness. Its Node service is not required by and is not launched alongside the shipping application.

## Tests

```sh
npm test                          # validation, permissions, local service protection/cache
npm run build
npm run test:desktop               # standalone Electron; requires graphical session
npm run test:maps                  # pins, dragging, repeaters and map panels
npm run test:workspace             # clocks, weather, themes, transfers, isolated views
npm run test:contacts              # saved-location/contact navigation and missing locations
npm run test:locations             # autocomplete, exact pin corrections, sliders, double Escape
npm run test:display               # map toolbar, radar legend, text size and zoom shortcuts
npm run test:layout                # viewport fit, home, modal tabs, grey-line time and MUF layer
npm run test:quick                 # quick switches, drawer selection, login/restart policies
npm run test:panels                # resizing/persistence, auto-hidden themed scrollbars, alignment
npm run test:items                 # read-only/edit, private saved search, grouping, context, home persistence
npm run test:seven                 # link planner, clock colors, hover, menus, icons and responsive forecasts
npm run test:account               # private profile/avatar/devices, password change, original invoices in PDF
OAR_DESKTOP_EXECUTABLE="$PWD/releases/OAR-0.3.11.AppImage" npm run test:desktop
OAR_DESKTOP_EXECUTABLE="$PWD/releases/OAR-0.3.11.AppImage" npm run test:guidance
OAR_DESKTOP_EXECUTABLE="$PWD/releases/OAR-0.3.11.AppImage" npm run test:release-ten
npm run test:browser               # development harness / responsive UI
npm audit
```

The standalone smoke test starts **no external backend**, turns on offline mode, creates a local profile/QSO, closes and restarts the application, verifies persisted data, exports a database backup, checks renderer isolation and logs out. It uses a temporary application-data directory. Browser tests use separate development ports/database and Chromium (`CHROMIUM_PATH` can override the executable).

## Structure

- `desktop/main.cjs`, `desktop/preload.cjs`, `desktop/features.cjs` — standalone lifecycle, owned database, native dialogs, isolated specialist views and IPC
- `server/app.js` — embedded data-service implementation (also reusable by development tests)
- `scripts/build-local-service.js` — bundles that implementation into the executable
- `src/` — local-first shared UI, map, clocks and platform adapter
- `tests/` — data-service, native session, browser and standalone executable tests
- `ios/`, `android/` — unfinished/legacy mobile scaffolding, **not releases**

References: [OpenHamClock](https://github.com/vcsoc/openhamclock) and the user’s [Meridian](https://github.com/vcsoc/meridian). Their source/artwork was not copied. Providers include NOAA, RainViewer, Where the ISS at, Esri, KC2G, Environment Canada, LightningMaps and Short-wave.info. Additional providers: OpenFreeMap/OpenStreetMap (street labels and Photon geocoding), hearham.com (repeater directory), and [Open-Meteo](https://open-meteo.com/) (weather data, CC BY 4.0; free endpoint intended for non-commercial use). Review provider terms/quotas before commercial or high-volume distribution. Bundled Noto Sans Latin glyphs were obtained from OpenFreeMap, © 2018 The Noto Project Authors, SIL Open Font License 1.1 (`public/fonts/OFL.txt`, also included in the app). PDF reports bundle Noto Sans Regular, © 2022 The Noto Project Authors (latin-greek-cyrillic), SIL OFL 1.1 (`public/fonts/report-sans-LICENSE.txt`); the font and license ship locally, without a runtime font download. The offline city directory is adapted from GeoNames (CC BY 4.0); source, coverage and rebuild instructions are in `data/README.md`. Radar legend samples follow RainViewer’s published Universal Blue dBZ color table. Dependency licences remain with their authors.
