// RainViewer Universal Blue (scheme 2) samples from its published dBZ table:
// https://www.rainviewer.com/api/color-schemes.html
const rain = [
  [10, "#cec08796"],
  [15, "#88ddee"],
  [20, "#00a3e0"],
  [30, "#005588"],
  [35, "#ffee00"],
  [40, "#ffaa00"],
  [45, "#ff4400"],
  [50, "#c10000"],
  [55, "#ffaaff"],
  [65, "#ffffff"],
  [75, "#00ff00"],
];
export default function RadarLegend({ info }) {
  return (
    <aside className="radar-legend" aria-label="Radar legend">
      <b>RainViewer · reflectivity (dBZ)</b>
      <div className="radar-swatches">
        {rain.map(([dbz, color]) => (
          <span key={dbz}>
            <i style={{ background: color }} />
            {dbz}
            {dbz === 75 ? "+" : ""}
          </span>
        ))}
      </div>
      <div className="radar-strength">
        <span>Weaker rain echoes</span>
        <span>Stronger echoes / possible hail</span>
      </div>
      <div className="snow-key">
        <span>Snow</span>
        <i />
        <span>pale → deeper blue</span>
      </div>
      <small>
        Higher dBZ means stronger radar echoes, not a direct rainfall rate.
        Colors blend with the map at 70% opacity.
      </small>
      <small role="status">
        {info?.time
          ? `${info.stale ? "Cached frame" : "Latest available frame"} · ${new Date(info.time * 1000).toISOString().replace("T", " ").slice(0, 16)} UTC`
          : "Waiting for radar frame…"}
        {info?.error ? " · " + info.error : ""}
      </small>
      <small>
        Coverage gaps are not proof of clear weather. Not for safety-critical
        use.
      </small>
    </aside>
  );
}
