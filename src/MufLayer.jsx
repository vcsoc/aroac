import { useEffect, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { api } from "./lib";
import { useSourceRevision } from "./sourceEvents";
import { useMufContours, useContourLayer } from "./MufContours";
export const MUF_COLORS = [
  "#5289d8",
  "#55c8b0",
  "#e1d36b",
  "#ef9951",
  "#db75bb",
];
export function useMuf(enabled) {
  const sourceRevision = useSourceRevision();
  const contours = useMufContours(enabled);
  const [state, setState] = useState({});
  useEffect(() => {
    if (!enabled) {
      setState({});
      return;
    }
    let live = true;
    const load = () =>
      api("/muf")
        .then((value) => {
          if (live) setState({ value });
        })
        .catch((e) => {
          if (live)
            setState((s) => ({
              ...s,
              value: s.value ? { ...s.value, stale: true } : undefined,
              error: e.message,
            }));
        });
    load();
    const timer = setInterval(load, 300000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [enabled, sourceRevision]);
  return { ...state, contours };
}
export function useMufLayer(map, ready, enabled, state, movingPinId) {
  useContourLayer(map, ready, enabled, state.contours);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const host = m.getContainer();
    host.dataset.mufCount = "0";
    if (!enabled) return;
    const features = (state.value?.stations || []).map((p) => {
      const uncertain =
        state.value.stale ||
        p.old ||
        p.confidence === null ||
        p.confidence < 75;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: {
          ...p,
          label: p.mhz.toFixed(1) + (uncertain ? "*" : ""),
          color: uncertain
            ? "#a5a5a5"
            : MUF_COLORS[Math.min(4, Math.floor(p.mhz / 10))],
          uncertain,
        },
      };
    });
    m.addSource("muf", {
      type: "geojson",
      data: { type: "FeatureCollection", features },
    });
    m.addLayer({
      id: "muf-observations",
      source: "muf",
      type: "circle",
      paint: {
        "circle-radius": 6,
        "circle-color": ["get", "color"],
        "circle-stroke-color": "#142019",
        "circle-stroke-width": 1.5,
      },
    });
    m.addLayer({
      id: "muf-labels",
      source: "muf",
      type: "symbol",
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 12,
        "text-anchor": "bottom",
        "text-offset": [0, -0.8],
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": ["get", "color"],
        "text-halo-color": "#101812",
        "text-halo-width": 2,
      },
    });
    host.dataset.mufCount = String(features.length);
    let popup;
    const click = (e) => {
      if (movingPinId) return;
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties;
      const body = document.createElement("div");
      body.className = "muf-popup";
      const title = document.createElement("strong");
      title.textContent = p.code + " · " + p.name;
      body.append(title);
      for (const text of [
        `MUF(3000 km): ${Number(p.mhz).toFixed(1)} MHz`,
        `Observed: ${p.observedAt} (UTC)`,
        `Confidence: ${p.confidence == null ? "not supplied" : p.confidence + " / 100"}`,
        p.uncertain
          ? "Cached, old or uncertain observation — not a current guarantee."
          : "Ionosonde observation, not a path prediction.",
        "KC2G · GIRO / participating ionosondes",
      ]) {
        const line = document.createElement("p");
        line.textContent = text;
        body.append(line);
      }
      popup?.remove();
      popup = new maplibregl.Popup({ maxWidth: "300px" })
        .setLngLat(e.lngLat)
        .setDOMContent(body)
        .addTo(m);
    };
    const enter = () => {
        m.getCanvas().style.cursor = "pointer";
      },
      leave = () => {
        m.getCanvas().style.cursor = "";
      };
    for (const id of ["muf-observations", "muf-labels"]) {
      m.on("click", id, click);
      m.on("mouseenter", id, enter);
      m.on("mouseleave", id, leave);
    }
    return () => {
      popup?.remove();
      for (const id of ["muf-labels", "muf-observations"]) {
        m.off("click", id, click);
        m.off("mouseenter", id, enter);
        m.off("mouseleave", id, leave);
        if (m.getLayer(id)) m.removeLayer(id);
      }
      if (m.getSource("muf")) m.removeSource("muf");
      host.dataset.mufCount = "0";
      leave();
    };
  }, [map, ready, enabled, state.value, movingPinId]);
}
export function MufLegend({ state }) {
  const v = state.value;
  const times = (v?.stations || []).map((p) => p.observedAt).sort();
  return (
    <details
      className="muf-legend"
      aria-label="MUF legend"
      onClickCapture={(e) => e.stopPropagation()}
      onMouseDownCapture={(e) => e.stopPropagation()}
      onDoubleClickCapture={(e) => e.stopPropagation()}
    >
      {" "}
      <summary>
        MUF(3000 km) · MHz ·{" "}
        {v
          ? `${v.stations.length} stations${v.stale ? " · cached" : ""}`
          : state.error
            ? "unavailable"
            : "loading…"}
      </summary>
      <div>
        {state.error && <p role="status">{state.error}</p>}
        {state.contours?.error && <p role="status">{state.contours.error}</p>}
        {state.contours?.value ? (
          <small>
            Modeled contours: {state.contours.value.geojson.features.length}{" "}
            lines ·{" "}
            {state.contours.value.stale
              ? "cached/old or publication time unknown (dashed)"
              : "latest downloaded"}{" "}
            · Published: {state.contours.value.publishedAt || "not supplied"} ·
            Downloaded: {state.contours.value.fetchedAt}. Publication time is
            not a measurement time.
          </small>
        ) : (
          !state.contours?.error && (
            <small>Loading modeled contour lines…</small>
          )
        )}
        {v && (
          <>
            <p>
              {v.offline ? "Offline · " : ""}
              {v.stale ? "Saved data — may be outdated. " : ""}
              {v.stations.length
                ? "Click a station dot or MHz label for details."
                : "No usable observations from the last 24 hours."}
            </p>
            {times.length > 0 && (
              <small>
                Observation times (UTC): {times[0]} — {times.at(-1)}
              </small>
            )}
            <div className="muf-key">
              {["<10", "10–20", "20–30", "30–40", "≥40"].map((n, i) => (
                <span key={n}>
                  <i style={{ background: MUF_COLORS[i] }} />
                  {n}
                </span>
              ))}{" "}
              MHz
            </div>
            <small>
              Gray/*: cached, over 90 minutes old, or confidence below
              75/unknown. {v.omitted} older/future observations omitted.
            </small>
          </>
        )}
        <p>
          Dots are ionosonde measurements; lines are KC2G modeled contours, not
          connections between dots. MUF for a reference 3000 km path, not a
          guaranteed usable frequency for your contact. Model estimates may be
          less reliable far from stations. Independent of the clock slider.
        </p>
        <a
          href="https://prop.kc2g.com/acknowledgments/"
          target="_blank"
          rel="noreferrer"
        >
          KC2G · GIRO / ionosonde contributors ↗
        </a>
      </div>
    </details>
  );
}
