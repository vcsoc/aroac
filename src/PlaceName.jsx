import { useEffect, useState } from "react";
import { api } from "./lib";
import { Help } from "./InterfaceUI";
export default function PlaceName({ lat, lng, time }) {
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
      <div className="mapped-place">
        <b>City / place</b>
        <div className="place-region-time">
          <small>
            {state.error ? "Place name unavailable" : "Finding place name…"}
          </small>
          {time}
        </div>
      </div>
    );
  const p = state.value;
  return (
    <div className="mapped-place">
      <b>
        {p.kind === "nearest" ? "Nearest mapped place: " : "City / place: "}
        {p.name}
      </b>
      <div className="place-region-time">
        <small>{[p.region, p.country].filter(Boolean).join(" · ")}</small>
        {time}
      </div>
      <Help label="About this place lookup">
        {p.source}
        {p.kind === "nearest"
          ? ` · ${p.distanceKm.toFixed(1)} km from its mapped centre (not a boundary lookup)`
          : ""}
      </Help>
    </div>
  );
}
