// Visual labels are decorative: the parent button remains the accessible switch.
export default function OnOffTrack() {
  return (
    <span className="on-off-track" aria-hidden="true">
      <span>ON</span>
      <span>OFF</span>
    </span>
  );
}
