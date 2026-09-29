import { useEffect, useMemo, useState } from "react";
import { linkGeometry, horizonKm } from "./contactContext";
import { estimateClearance } from "../server/elevation.js";
import { api } from "./lib";
import { Help } from "./InterfaceUI";

function suggestedRepeaters(source, destination, repeaters) {
  if (!source || !destination) return [];
  return (repeaters || [])
    .map((repeater) => ({
      ...repeater,
      sourceKm: linkGeometry(source, repeater)?.distance,
      destinationKm: linkGeometry(destination, repeater)?.distance,
    }))
    .filter((r) => r.sourceKm <= 70 && r.destinationKm <= 70)
    .sort((a, b) => Math.max(a.sourceKm, a.destinationKm) - Math.max(b.sourceKm, b.destinationKm))
    .slice(0, 3);
}

export default function LinkPlanner({ source, destination, onClear, directory, directoryLoading, directoryError }) {
  const [a, setA] = useState("1"), [b, setB] = useState("1");
  const [profile, setProfile] = useState(null), [profileError, setProfileError] = useState("");
  const path = source && destination ? linkGeometry(source, destination) : null;
  useEffect(() => {
    setProfile(null);
    setProfileError("");
    if (!source || !destination) return;
    let active = true;
    api(`/elevation-profile?lat1=${source.lat}&lng1=${source.lng}&lat2=${destination.lat}&lng2=${destination.lng}`)
      .then((data) => { if (active) setProfile(data); })
      .catch((error) => { if (active) setProfileError(error.message); });
    return () => { active = false; };
  }, [source?.lat, source?.lng, destination?.lat, destination?.lng]);
  const known = [a, b].every((v) => v !== "" && Number.isFinite(Number(v)) && +v >= 0 && +v <= 10000);
  const optical = known ? horizonKm(+a, +b) : null;
  const radio = known ? horizonKm(+a, +b, 4 / 3) : null;
  const clearance = known && profile && !profile.endpointsOnly ? estimateClearance(profile.elevations, profile.distanceKm, +a, +b) : null;
  const candidates = useMemo(() => suggestedRepeaters(source, destination, directory?.repeaters), [source, destination, directory]);
  return (
    <section className="link-planner">
      <h3>Source → destination</h3>
      <p>
        Source: {source ? `${source.lat.toFixed(6)}, ${source.lng.toFixed(6)}` : "Right-click a map/globe point and set the source."}<br />
        Destination: {destination ? `${destination.lat.toFixed(6)}, ${destination.lng.toFixed(6)}` : "Right-click another point and choose Analyse link from source."}
      </p>
      {path && <>
        <strong>Short path: {path.distance.toFixed(2)} km · {path.bearing == null ? "Bearing undefined" : path.bearing.toFixed(1) + "° true from source"}</strong>
        <div className="link-site-elevation" role="status">
          <span>Source ground elevation: {profile ? `${Math.round(profile.elevations[0])} m above sea level` : profileError ? "DEM unavailable" : "Loading DEM…"}</span>
          <span>Destination ground elevation: {profile ? `${Math.round(profile.elevations.at(-1))} m above sea level` : profileError ? "DEM unavailable" : "Loading DEM…"}</span>
        </div>
        <label>Source antenna height above local ground (metres)
          <input aria-label="Source antenna height" type="number" min="0" max="10000" step="any" value={a} onChange={(e) => setA(e.target.value)} />
        </label>
        <label>Destination antenna height above local ground (metres)
          <input aria-label="Destination antenna height" type="number" min="0" max="10000" step="any" value={b} onChange={(e) => setB(e.target.value)} />
        </label>
        {known ? <p>Ideal smooth-Earth optical horizon: {optical.toFixed(1)} km. Nominal radio horizon (4/3 effective Earth radius): {radio.toFixed(1)} km. This path is {path.distance <= radio ? "within" : "beyond"} the nominal radio horizon assuming equal ground elevation.</p> : <p>Enter both antenna heights to estimate the horizon. Heights are not guessed.</p>}
        <p className="link-clearance" role="status">
          {clearance !== null ? <><b>Estimated terrain path: {clearance >= 0 ? `clear by at least ${clearance.toFixed(0)} m at sampled points` : `blocked by at least ${Math.abs(clearance).toFixed(0)} m at sampled points`}.</b> DEM elevations and 4/3-Earth curvature; {profile.spacingKm.toFixed(1)} km between samples{profile.stale ? ", saved offline profile" : ""}. This is not a surveyed or verified line of sight.</> : <><b>Terrain path: {profileError || (profile && !known ? "Enter valid antenna heights." : profile?.endpointsOnly ? "Only endpoint elevations are available for paths over 500 km; terrain clearance needs a separate survey." : "Loading elevation profile…")}</b> {known && `Smooth-Earth horizon alone ${path.distance <= radio ? "allows" : "excludes"} the nominal direct path at equal ground elevation; it does not account for terrain.`}</>}{" "}
          <Help label="About line-of-sight estimates">Terrain samples are DEM estimates and can miss hills between samples, buildings, vegetation, Fresnel-zone obstructions, and unusual refraction. A positive result does not guarantee a radio link. Verify the path and local regulations before operating.</Help>
        </p>
        <details className="link-planning-details" open>
          <summary>Radio settings to investigate (source and destination)</summary>
          <p>Agree a locally permitted frequency, mode, bandwidth, power and antenna polarization with the other station. No transmit frequency or tone is invented here; check your licence privileges and local band plan.</p>
          <h4>Direct link (both stations)</h4>
          <p>{clearance !== null && clearance < 0 ? "Sampled terrain obstructs this VHF/UHF path; investigate a suitable repeater, more antenna height, or an alternative band." : "If the path is surveyed clear, investigate matching VHF/UHF FM simplex equipment and vertical antennas at both ends, or another mutually supported mode."} For beyond-horizon links consider HF according to propagation, antenna capability and operating time; 40 m often uses LSB and 20 m USB for voice where permitted. Band examples are not assigned frequencies.</p>
          <h4>Candidate shared repeaters</h4>
          {directoryLoading && <p>Loading repeater directory…</p>}
          {!directoryLoading && (directoryError || !directory) && <p>{directoryError || "Repeater directory unavailable."} Repeater settings cannot be safely recommended without a directory.</p>}
          {directory && !candidates.length && <p>No directory repeater within 70 km of both endpoints. This does not rule out more distant or unlisted repeaters.</p>}
          {candidates.map((r) => <div className="link-repeater" key={r.id}>
            <strong>{r.callsign || "Unlabelled repeater"} · {r.frequencyMHz.toFixed(4)} MHz receive/output</strong>
            <small>{r.city || "Location not supplied"} · source {r.sourceKm.toFixed(1)} km · destination {r.destinationKm.toFixed(1)} km{directory.stale ? " · saved directory" : ""}</small>
            <p><b>Source radio:</b> Receive {r.frequencyMHz.toFixed(4)} MHz; transmit {r.offsetMHz == null ? "offset not listed—verify before programming" : `${(r.frequencyMHz + r.offsetMHz).toFixed(4)} MHz (${r.offsetMHz >= 0 ? "+" : ""}${r.offsetMHz.toFixed(4)} MHz offset)`}. Mode {r.mode || "not listed"}; CTCSS/DCS tone and bandwidth: verify with repeater owner.</p>
            <p><b>Destination radio:</b> Use the same receive/output, transmit/input offset, mode and verified tone; check local access permissions. Distances alone do not establish coverage.</p>
          </div>)}
          <details className="link-planning-details"><summary>Calculation and operating caveats</summary><p>Radio horizon is a smooth-Earth estimate only. DEM sampling does not establish Fresnel clearance or repeater coverage. Frequencies, tones, modes and offsets must be independently verified from a current directory or operator before transmitting.</p></details>
        </details>
      </>}
      <button onClick={onClear}>Clear source and destination</button>
    </section>
  );
}
