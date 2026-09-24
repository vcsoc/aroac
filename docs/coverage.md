# Topographic maps and estimated radio range

AROAC computes range geometry locally. This is a planning aid, not a coverage survey, terrain propagation engine or VOACAP implementation.

## Use

Open the left panel and choose its **Range** tab. Choose **Map view → Topographic**, enable **Estimated range**, select a band and select a location on the map, through search, a saved location or Home. The **General** tab contains Location details and weather; **Settings** contains the map-layer switches. Switching tabs does not clear estimates or the selected origin. The selected location becomes the origin. Settings persist locally; the selected origin is session-only.

- **Blue ring:** local direct-range estimate or HF outer single-hop boundary.
- **Dashed blue ring:** modeled HF skip boundary; the area inside is not claimed to have skywave coverage.
- **Green rings:** secondary footprints around candidate repeaters, only while the repeaters layer is enabled. These are not one inflated circle around the originating station.
- **Gold ring:** selected repeater's estimated local footprint. Clicking a repeater enables Estimated range and opens details. This is shown even if the repeater is not reachable from the originating station. The details panel also displays the estimated radius and all supplied provider fields.

Turn Estimated range off to remove all range geometry. Turn the repeaters layer off to remove secondary/selected repeater rings. Expand **Range assumptions & limitations** to adjust inputs. Band identifiers are broad planning ranges, not permission to transmit or a jurisdiction-specific band plan.

## Model

For 6 m and shorter wavelengths, radius is the smaller of:

- Standard 4/3-Earth horizon: `4.12 × (sqrt(h1) + sqrt(h2))` km, antenna heights in metres above local surrounding ground.
- Free-space link-budget distance using the selected frequency, entered transmitter power, receiver sensitivity and fade margin; isotropic antennas and 6 dB combined system loss.

The default 10 m / 1.5 m heights yield about 18.1 km direct radius; assumed 30 m repeater height yields about 27.6 km to a 1.5 m receiver. These are assumptions, not observed coverage. Bands can have the same radius when height rather than frequency limits them.

A candidate repeater must have known input and output frequencies in the selected band and be within the modeled station↔repeater link limit. The nearest 40 candidate footprints are drawn to bound rendering work; the UI reports truncation. No multirepeater chains, mode compatibility, tone authorization or operational-status validation is inferred. Directory data usually lacks verified antenna height/power; the entered assumptions are used uniformly. Different sites can have radically different real coverage.

For HF, the engine uses a spherical Earth (6371.0088 km radius), a thin assumed F2 shell, approximate secant law, manually entered foF2 and a minimum take-off elevation. It draws an inner/outer _geometric_ single-hop envelope, or no F2 path when the chosen frequency exceeds this model's assumed MUF. The height is an approximation, not a measured virtual reflection height. It does not compute reliability percentages, groundwave, D-region absorption, multi-hop, antenna radiation patterns, seasonal or UTC-dependent forecasts. The existing MUF observation layer remains independent: it is not silently fed into a global shell model.

No terrain obstruction, buildings, diffraction, interference, sporadic-E or tropospheric enhancement is modeled. Topographic tiles are visual context only. Dateline crossings are split into line segments; no misleading filled disk is drawn across the world.

## Map/source availability

Default topographic tiles: Esri World Topographic Map, with provider attribution. The `mapTopographic` / `xyz-raster` entry in `sources.yaml` is configurable through the existing Sources settings. Old source configurations without this optional kind remain valid and use the built-in topographic default. Tiles require network access; no offline bulk-download rights or offline basemap package is implied. Local range geometry and previously cached repeater records continue to work without network access.

## Repeater data research

Current integration remains hearham.com (`https://hearham.com/api/repeaters/v1`), with local cache and all returned fields visible in repeater details.

RepeaterBook documentation was checked directly at <https://www.repeaterbook.com/wiki/doku.php?id=api>. Its current policy requires approved application access; distributed desktop applications must use per-user, app-bound tokens, not a shared secret embedded in the application. Bulk extraction, redistribution and offline bundling require written permission. No RepeaterBook export requests, scraping, copied database or embedded credentials were added.

RepeaterBook's documented fields include input/output frequency, PL/CTCSS, membership/access, operating status, digital modes/color codes and linked-network identifiers. These can improve channel planning, but the documented list does not establish reliable antenna AGL height, ERP, terrain-aware range or coverage polygons. Data courtesy of RepeaterBook.com (documentation research only). The details panel links to its site for manual cross-checking. A production adapter requires approval and explicit caching terms, then secure per-user token storage and provenance/refresh behavior. Do not treat an external directory entry as measured RF coverage.

## Validation

- Unit tests cover model limits, frequency/height behavior, HF no-path/skip geometry, invalid inputs, candidate filtering, 40-site cap, geodesic distances and dateline/polar line geometry.
- Native Electron map interaction tests cover topographic selection, location selection, direct/secondary/selected repeater rings, HF band changes, overlay removal, cached directory details and existing map/pin behavior.
- Actual default topographic tile request returned HTTP 200 / image/jpeg.
- No real RF coverage, Windows/macOS native runtime or mobile runtime validation is claimed.

## Follow-on propagation work

The shared discussion's full VOACAP/GIRO/GloTEC architecture is broader than these initial local estimates. A future calibrated prediction feature needs a distributable local engine with reviewed licensing, validated outputs, timestamped observations with spatial uncertainty and clear offline/stale handling. AROAC must not require users to install a separate propagation server. Never relabel this geometric model as live band reliability.
