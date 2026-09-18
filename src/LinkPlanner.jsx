import { useEffect, useState } from "react";
import { linkGeometry, horizonKm } from "./contactContext";
export default function LinkPlanner({ source, destination, onClear }) {
  const [a, setA] = useState(""),
    [b, setB] = useState("");
  useEffect(() => setA(""), [source?.lat, source?.lng]);
  useEffect(() => setB(""), [destination?.lat, destination?.lng]);
  const path = source && destination ? linkGeometry(source, destination) : null;
  const known =
    a !== "" &&
    b !== "" &&
    Number.isFinite(+a) &&
    Number.isFinite(+b) &&
    +a >= 0 &&
    +b >= 0 &&
    +a <= 10000 &&
    +b <= 10000;
  const optical = known ? horizonKm(+a, +b) : null,
    radio = known ? horizonKm(+a, +b, 4 / 3) : null;
  return (
    <section className="link-planner">
      <h3>Source → destination</h3>
      <p>
        Source:{" "}
        {source
          ? `${source.lat.toFixed(6)}, ${source.lng.toFixed(6)}`
          : "Right-click a map/globe point and set the source."}
        <br />
        Destination:{" "}
        {destination
          ? `${destination.lat.toFixed(6)}, ${destination.lng.toFixed(6)}`
          : "Right-click another point and choose Analyse link from source."}
      </p>
      {path && (
        <>
          <strong>
            Short path: {path.distance.toFixed(2)} km ·{" "}
            {path.bearing == null
              ? "Bearing undefined"
              : path.bearing.toFixed(1) + "° true from source"}
          </strong>
          <label>
            Source antenna height above local ground (metres)
            <input
              aria-label="Source antenna height"
              type="number"
              min="0"
              max="10000"
              step="any"
              value={a}
              onChange={(e) => setA(e.target.value)}
            />
          </label>
          <label>
            Destination antenna height above local ground (metres)
            <input
              aria-label="Destination antenna height"
              type="number"
              min="0"
              max="10000"
              step="any"
              value={b}
              onChange={(e) => setB(e.target.value)}
            />
          </label>
          {known ? (
            <p>
              Ideal smooth-Earth optical horizon: {optical.toFixed(1)} km.
              Nominal radio horizon (effective Earth radius 4/3):{" "}
              {radio.toFixed(1)} km. This path is{" "}
              {path.distance <= radio ? "within" : "beyond"} that nominal radio
              horizon.
            </p>
          ) : (
            <p>
              Enter both antenna heights to estimate the horizon. Heights are
              not guessed.
            </p>
          )}
          <p>
            <b>Terrain-verified line of sight: unknown.</b> No elevation
            profile, buildings, vegetation or Fresnel-zone clearance data is
            available. The horizon estimate cannot confirm a usable radio link
            and does not account for differing ground elevations or changing
            atmospheric refraction.
          </p>
          <h4>Configuration to investigate</h4>
          {known && path.distance <= radio ? (
            <p>
              For a confirmed unobstructed local path, investigate mutually
              supported VHF/UHF equipment, matching mode/bandwidth and antenna
              polarization. A common local voice option is FM simplex with
              matched vertical antennas, where supported and permitted.
              Reference bands: 2 m ≈144 MHz (144,000,000 Hz), 70 cm ≈430 MHz
              (430,000,000 Hz). These are band references, not calling or
              transmit frequencies; allocations vary by jurisdiction.
            </p>
          ) : (
            <p>
              Direct VHF/UHF may need a surveyed clear path, taller antennas or
              a suitable repeater. For beyond-horizon communication investigate
              HF: 40 m ≈7 MHz (7,000,000 Hz), 20 m ≈14 MHz (14,000,000 Hz).
              Usable bands depend on time, ionospheric conditions and
              antennas—not distance alone. Common voice-mode conventions to
              investigate are LSB on 40 m and USB on 20 m; CW/digital modes need
              their own agreed settings. These examples are not path-specific
              recommendations.
            </p>
          )}
          <p>
            No reliable dial frequency, power, mode or bandwidth can be
            recommended without both stations’ capabilities, licence privileges,
            local band plans and propagation/path measurements. Agree a clear
            permitted frequency and configuration before transmitting. This is
            planning guidance, not a link guarantee.
          </p>
        </>
      )}
      <button onClick={onClear}>Clear source and destination</button>
    </section>
  );
}
