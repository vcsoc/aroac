import { useEffect, useRef } from "react";
import { RotateCcw } from "lucide-react";
import {
  COVERAGE_BANDS,
  DEFAULT_COVERAGE,
  coverageBounds,
} from "../shared/coverage";
import "./coverage.css";
import OnOffTrack from "./OnOffTrack.jsx";

export function CoverageControls({
  value,
  onChange,
  origin,
  coverage,
  topographic,
  setTopographic,
  showRepeaters,
}) {
  const change = (key, next) => onChange({ ...value, [key]: next });
  const field = (key, title, min, max, step = 1) => (
    <label key={key}>
      {title}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value[key]}
        onChange={(e) => {
          if (e.target.value !== "" && e.target.validity.valid)
            change(key, Number(e.target.value));
        }}
      />
    </label>
  );
  return (
    <section className="coverage-controls" aria-label="Coverage planning">
      <div className="coverage-heading">
        <h2 className="location-section-heading">Range estimation</h2>
        {value.enabled && (
          <button
            type="button"
            className="coverage-reset"
            aria-label="Reset range defaults"
            title="Reset band, range assumptions and map view to defaults; keep range enabled"
            onClick={() => {
              onChange({ ...DEFAULT_COVERAGE, enabled: true });
              setTopographic(false);
            }}
          >
            <RotateCcw size={14} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="range-power-toggle"
          role="switch"
          aria-label="Estimated range"
          aria-checked={value.enabled}
          title={
            value.enabled
              ? "Turn estimated range OFF"
              : "Turn estimated range ON"
          }
          onClick={() => change("enabled", !value.enabled)}
        >
          <OnOffTrack />
        </button>
      </div>
      <div className="coverage-toolbar">
        <label>
          Map view
          <select
            aria-label="Map view"
            value={topographic ? "topographic" : "imagery"}
            onChange={(e) => setTopographic(e.target.value === "topographic")}
          >
            <option value="imagery">Satellite imagery</option>
            <option value="topographic">Topographic</option>
          </select>
        </label>
        <label>
          Band
          <select
            aria-label="Coverage band"
            value={value.band}
            onChange={(e) => change("band", e.target.value)}
          >
            {COVERAGE_BANDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.id} · {b.mhz} MHz
              </option>
            ))}
          </select>
        </label>
      </div>
      {value.enabled && (
        <>
          <p className="coverage-summary" role="status">
            {!origin ? (
              "Select a location on the map, a saved location, or Home to set the range origin."
            ) : (
              <>
                Origin {origin.lat.toFixed(3)}°, {origin.lng.toFixed(3)}° ·{" "}
                {coverage.band.hf
                  ? coverage.outerKm > 0
                    ? `F2 single-hop envelope: ${Math.round(coverage.innerKm)}–${Math.round(coverage.outerKm)} km. Dashed inner ring marks the modeled skip boundary.`
                    : "No F2 path at this frequency under the entered assumptions."
                  : `Direct estimated radius: ${coverage.directKm.toFixed(1)} km.`}
                {!coverage.band.hf &&
                  showRepeaters &&
                  ` ${coverage.shown} candidate repeater footprints${coverage.capped ? ` (nearest 40 of ${coverage.eligible})` : ""}.`}
              </>
            )}
          </p>
          {coverage.selectedRepeater && (
            <p role="status">
              Selected repeater {coverage.selectedRepeater.callsign || "site"}:
              estimated radius {coverage.selectedRepeater.radiusKm.toFixed(1)}{" "}
              km (gold ring). This does not mean your station can access it.
            </p>
          )}
          <section
            className="coverage-assumptions"
            aria-label="Range assumptions & limitations"
          >
            <h4>Range assumptions & limitations</h4>
            <p className="coverage-info">
              <span aria-hidden="true">ⓘ </span>
              Blue = direct / outer F2 boundary; dashed blue = HF skip boundary;
              green = secondary repeater range, centered on each candidate site.
              These are planning estimates, not guaranteed coverage or contact
              probabilities.
            </p>
            <div className="coverage-fields">
              {coverage.band.hf ? (
                <>
                  {field("hmF2", "Assumed F2 height (km)", 150, 500)}
                  {field("foF2", "Assumed foF2 (MHz)", 1, 20, 0.1)}
                  {field("minElevation", "Minimum take-off angle (°)", 1, 45)}
                </>
              ) : (
                <>
                  {field(
                    "txHeight",
                    "Station antenna height AGL (m)",
                    0.5,
                    500,
                    0.5,
                  )}
                  {field(
                    "rxHeight",
                    "Other station height AGL (m)",
                    0.5,
                    500,
                    0.5,
                  )}
                  {field(
                    "repeaterHeight",
                    "Assumed repeater height AGL (m)",
                    0.5,
                    1000,
                    0.5,
                  )}
                  {field(
                    "power",
                    "Assumed transmitter power (W)",
                    0.001,
                    1500,
                    0.001,
                  )}
                  {field(
                    "sensitivity",
                    "Receiver sensitivity (dBm)",
                    -140,
                    -50,
                  )}
                  {field("margin", "Fade margin (dB)", 0, 60)}
                </>
              )}
            </div>
            {coverage.band.hf ? (
              <p>
                Local spherical-Earth thin-shell geometry and approximate secant
                law only. F2 values are manual assumptions, NOT live ionosonde
                measurements. No VOACAP reliability, D-layer absorption,
                groundwave, multi-hop, antenna pattern, solar or UTC-dependent
                forecast is computed. A ring can include paths that are
                unusable. Enable the existing MUF layer separately for provider
                observations.
              </p>
            ) : (
              <p>
                4/3-Earth radio horizon capped by free-space link budget;
                isotropic antennas, 6 dB system loss and symmetric assumed
                equipment. Frequency matters to the link budget; height-limited
                bands can have equal radii. No terrain obstruction, buildings,
                diffraction, interference or sporadic-E/tropospheric enhancement
                is modeled.
              </p>
            )}
            <p>
              Topographic tiles are visual context only, not a terrain-aware RF
              model; tiles need network access. Repeater footprints appear only
              with the repeaters layer enabled on VHF/UHF: known input/output
              frequencies in the chosen band and site within the estimated
              uplink radius. Heights/power are assumed, not directory
              measurements. Mode, tones, access and operational status are
              unverified. No repeater chains or automatic band authorization;
              verify local licence rules.
            </p>
          </section>
        </>
      )}
    </section>
  );
}

export function useCoverageLayer(map, ready, coverage) {
  const lastFit = useRef(null);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    if (!m.getSource("coverage")) {
      m.addSource("coverage", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer(
        {
          id: "coverage-ranges",
          type: "line",
          source: "coverage",
          filter: [
            "all",
            ["==", ["geometry-type"], "LineString"],
            ["!=", ["get", "kind"], "skip"],
          ],
          paint: {
            "line-color": [
              "match",
              ["get", "kind"],
              "secondary",
              "#7fe3a0",
              "selected-repeater",
              "#ffcc66",
              "#66cfff",
            ],
            "line-width": 2.5,
            "line-opacity": 0.9,
          },
        },
        "zones",
      );
      m.addLayer(
        {
          id: "coverage-skip",
          type: "line",
          source: "coverage",
          filter: ["==", ["get", "kind"], "skip"],
          paint: {
            "line-color": "#66cfff",
            "line-width": 2,
            "line-dasharray": [3, 3],
          },
        },
        "zones",
      );
      m.addLayer({
        id: "coverage-origin",
        type: "circle",
        source: "coverage",
        filter: ["==", ["get", "kind"], "origin"],
        paint: {
          "circle-radius": 6,
          "circle-color": "#66cfff",
          "circle-stroke-color": "#101513",
          "circle-stroke-width": 2,
        },
      });
    }
    m.getSource("coverage").setData({
      type: "FeatureCollection",
      features: coverage.features,
    });
    m.getContainer().dataset.coverageCount = String(coverage.features.length);
    // Refit on band/enable changes, not on polling, assumption edits or manual panning.
    const key = coverage.settings?.enabled ? coverage.band.id : null;
    if (!key) {
      lastFit.current = null;
      return;
    }
    if (lastFit.current === key) return;
    const bounds = coverageBounds(coverage);
    if (!bounds) {
      lastFit.current = null;
      return;
    }
    lastFit.current = key;
    const container = m.getContainer();
    m.fitBounds(bounds, {
      padding: Math.min(
        48,
        container.clientWidth / 8,
        container.clientHeight / 8,
      ),
      maxZoom: 14,
      bearing: 0,
      pitch: 0,
      duration: 600,
      essential: false,
    });
  }, [ready, coverage, map]);
}
