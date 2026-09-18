import { useEffect, useState } from "react";
import { api } from "./lib";
export default function PlaceName({ lat, lng }) {
  const [state, setState] = useState({});
  useEffect(() => {
    let live = true;
    setState({});
    const timer = setTimeout(
      () =>
        api(`/places/reverse?lat=${lat}&lng=${lng}`)
          .then((value) => {
            if (live) setState({ value });
          })
          .catch(() => {
            if (live) setState({ error: true });
          }),
      200,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [lat, lng]);
  if (!state.value)
    return (
      <small>
        {state.error
          ? "Place name unavailable; use the coordinates below."
          : "Finding place name…"}
      </small>
    );
  const p = state.value;
  return (
    <div className="mapped-place">
      <b>
        {p.kind === "nearest" ? "Nearest mapped place: " : "City / place: "}
        {p.name}
      </b>
      <small>
        {[p.region, p.country].filter(Boolean).join(" · ")}
        {p.kind === "nearest"
          ? ` · ${p.distanceKm.toFixed(1)} km from its mapped centre (not a boundary lookup)`
          : ""}
      </small>
      <small>{p.source}</small>
    </div>
  );
}
