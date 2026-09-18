import { useEffect, useState } from "react";
import { api } from "./lib";
import { useSourceRevision } from "./sourceEvents";
export function useMufContours(enabled) {
  const sourceRevision = useSourceRevision();
  const [state, setState] = useState({});
  useEffect(() => {
    if (!enabled) {
      setState({});
      return;
    }
    let live = true;
    const load = () =>
      api("/muf-contours")
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
  return state;
}
export function useContourLayer(map, ready, enabled, state) {
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const host = m.getContainer();
    host.dataset.mufContours = "0";
    if (!enabled || !state?.value) return;
    const v = state.value;
    m.addSource("muf-contours", { type: "geojson", data: v.geojson });
    const before = m.getLayer("muf-observations")
      ? "muf-observations"
      : undefined;
    const color = [
      "step",
      ["get", "mhz"],
      "#5289d8",
      10,
      "#55c8b0",
      20,
      "#e1d36b",
      30,
      "#ef9951",
      40,
      "#db75bb",
    ];
    m.addLayer(
      {
        id: "muf-contour-halo",
        source: "muf-contours",
        type: "line",
        paint: {
          "line-color": "#101812",
          "line-width": 4,
          "line-opacity": 0.8,
        },
      },
      before,
    );
    m.addLayer(
      {
        id: "muf-contour-lines",
        source: "muf-contours",
        type: "line",
        paint: {
          "line-color": color,
          "line-width": 1.8,
          "line-opacity": v.stale ? 0.6 : 0.95,
          ...(v.stale ? { "line-dasharray": [3, 2] } : {}),
        },
      },
      before,
    );
    m.addLayer(
      {
        id: "muf-contour-labels",
        source: "muf-contours",
        type: "symbol",
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": 220,
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
        },
        paint: {
          "text-color": color,
          "text-halo-color": "#101812",
          "text-halo-width": 2,
        },
      },
      before,
    );
    host.dataset.mufContours = String(v.geojson.features.length);
    return () => {
      for (const id of [
        "muf-contour-labels",
        "muf-contour-lines",
        "muf-contour-halo",
      ])
        if (m.getLayer(id)) m.removeLayer(id);
      if (m.getSource("muf-contours")) m.removeSource("muf-contours");
      host.dataset.mufContours = "0";
    };
  }, [map, ready, enabled, state?.value]);
}
