import { withTimezone } from "./locations";
import { useEffect } from "react";
import * as maplibregl from "maplibre-gl";
export const REPEATER_LAYERS = [
  "repeater-clusters",
  "repeater-counts",
  "repeater-points",
];
export const STREET_LAYERS = ["street-names-major", "street-names-minor"];
export function useStreetLabels(mapRef, ready, enabled, host) {
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    host.current.dataset.streetNames = String(enabled);
    if (!enabled) return;
    m.addSource("streets", {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
      attribution: "© OpenStreetMap contributors · OpenFreeMap",
    });
    for (const [index, id] of STREET_LAYERS.entries())
      m.addLayer({
        id,
        type: "symbol",
        source: "streets",
        "source-layer": "transportation_name",
        minzoom: index ? 13 : 10,
        filter: index
          ? [
              "!",
              [
                "in",
                ["get", "class"],
                [
                  "literal",
                  ["motorway", "trunk", "primary", "secondary", "tertiary"],
                ],
              ],
            ]
          : [
              "in",
              ["get", "class"],
              [
                "literal",
                ["motorway", "trunk", "primary", "secondary", "tertiary"],
              ],
            ],
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": 220,
          "text-field": [
            "coalesce",
            ["get", "name:latin"],
            ["get", "name:en"],
            ["get", "name"],
          ],
          "text-font": ["Noto Sans Regular"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            14,
            14,
            16,
            18,
            19,
          ],
          "text-max-angle": 40,
          "text-padding": 4,
          "text-rotation-alignment": "map",
          "text-pitch-alignment": "viewport",
          "text-keep-upright": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#071019",
          "text-halo-width": 2.6,
          "text-halo-blur": 0.4,
        },
      });
    return () => {
      if (mapRef.current !== m) return;
      STREET_LAYERS.forEach((id) => {
        if (m.getLayer(id)) m.removeLayer(id);
      });
      if (m.getSource("streets")) m.removeSource("streets");
    };
  }, [ready, enabled]);
}
export function useSavedPins(mapRef, ready, pins, callbacks) {
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    let popup;
    const markers = pins.map((pin) => {
      const element = document.createElement("button");
      element.type = "button";
      // MapLibre starts marker drags on any mousedown. A context menu can
      // consume mouseup, leaving a phantom drag; only primary-button downs
      // may reach its drag handler.
      element.addEventListener("mousedown", (e) => {
        if (e.button !== 0) e.stopPropagation();
      });
      element.className = "saved-map-pin";
      element.dataset.pinId = String(pin.id);
      element.setAttribute("aria-label", "Saved pin " + pin.label);
      const hover = () => {
        popup?.remove();
        const content = document.createElement("div");
        content.setAttribute("role", "tooltip");
        content.id = "pin-tooltip-" + pin.id;
        element.setAttribute("aria-describedby", content.id);
        const heading = document.createElement("strong");
        heading.textContent = [pin.callsign, pin.name, pin.label]
          .filter(Boolean)
          .join(" · ");
        content.append(heading);
        const location = withTimezone(pin);
        for (const text of [
          `${pin.lat.toFixed(6)}, ${pin.lng.toFixed(6)} · ${location.grid}`,
          location.zone,
          pin.notes?.slice(0, 160),
          "Click for details · drag to move · right-click for options",
        ]) {
          if (!text) continue;
          const p = document.createElement("p");
          p.textContent = text;
          content.append(p);
        }
        popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 16,
          className: "pin-hover-popup",
        })
          .setLngLat([pin.lng, pin.lat])
          .setDOMContent(content)
          .addTo(m);
        callbacks.current.onPinHover?.(pin);
      };
      const leave = () => {
        element.removeAttribute("aria-describedby");
        popup?.remove();
        callbacks.current.onPinHover?.(null);
      };
      element.addEventListener("mouseenter", hover);
      element.addEventListener("mouseleave", leave);
      element.addEventListener("focus", hover);
      element.addEventListener("blur", leave);
      const label = document.createElement("span");
      label.className = "saved-pin-label";
      label.textContent = pin.callsign || pin.label;
      element.append(label);
      const marker = new maplibregl.Marker({
        element,
        draggable: true,
        opacityWhenCovered: 0,
      })
        .setLngLat([pin.lng, pin.lat])
        .addTo(m);
      let lastDrag = 0;
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        if (Date.now() - lastDrag > 250) callbacks.current.onPinSelect?.(pin);
      });
      element.addEventListener("contextmenu", (event) => {
        leave();
        event.preventDefault();
        event.stopPropagation();
        const point = marker.getLngLat().wrap();
        callbacks.current.onContext?.({
          x: event.clientX,
          y: event.clientY,
          lat: point.lat,
          lng: point.lng,
          pin,
        });
      });
      marker.on("dragstart", () => {
        leave();
        lastDrag = Date.now();
        callbacks.current.onContextClose?.();
      });
      marker.on("dragend", async () => {
        lastDrag = Date.now();
        const point = marker.getLngLat().wrap();
        try {
          await callbacks.current.onPinMove?.(pin.id, {
            lat: point.lat,
            lng: point.lng,
          });
        } catch {
          marker.setLngLat([pin.lng, pin.lat]);
        }
      });
      return marker;
    });
    return () => {
      popup?.remove();
      callbacks.current.onPinHover?.(null);
      markers.forEach((marker) => marker.remove());
    };
  }, [ready, pins]);
}
export function useRepeaterLayer(
  mapRef,
  ready,
  repeaters,
  selectedId,
  callbacks,
  host,
) {
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    host.current.dataset.repeaterCount = String(repeaters.length);
    if (!repeaters.length) return;
    m.addSource("repeaters", {
      type: "geojson",
      cluster: true,
      clusterRadius: 42,
      clusterMaxZoom: 12,
      data: {
        type: "FeatureCollection",
        features: repeaters.map((r) => ({
          type: "Feature",
          id: r.id,
          properties: { id: r.id, callsign: r.callsign },
          geometry: { type: "Point", coordinates: [r.lng, r.lat] },
        })),
      },
    });
    m.addLayer({
      id: "repeater-clusters",
      type: "circle",
      source: "repeaters",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#73c9df",
        "circle-radius": [
          "step",
          ["get", "point_count"],
          15,
          100,
          19,
          1000,
          24,
        ],
        "circle-stroke-color": "#10242b",
        "circle-stroke-width": 2,
      },
    });
    m.addLayer({
      id: "repeater-counts",
      type: "symbol",
      source: "repeaters",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["to-string", ["get", "point_count_abbreviated"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": 12,
      },
      paint: { "text-color": "#061214" },
    });
    m.addLayer({
      id: "repeater-points",
      type: "circle",
      source: "repeaters",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": "#ffbc6e",
        "circle-radius": 6,
        "circle-stroke-color": "#171f17",
        "circle-stroke-width": 1.5,
      },
    });
    const clickCluster = async (event) => {
      if (callbacks.current.movingPinId) return;
      const feature = event.features?.[0];
      if (!feature) return;
      const center = feature.geometry.coordinates;
      try {
        const zoom = await m
          .getSource("repeaters")
          .getClusterExpansionZoom(Number(feature.properties.cluster_id));
        if (mapRef.current === m)
          m.easeTo({ center, zoom: Math.min(19, zoom + 0.2), duration: 400 });
      } catch {}
    };
    const clickPoint = (event) => {
      if (callbacks.current.movingPinId) return;
      const ids = [
        ...new Set(
          m
            .queryRenderedFeatures(
              [
                [event.point.x - 5, event.point.y - 5],
                [event.point.x + 5, event.point.y + 5],
              ],
              { layers: ["repeater-points"] },
            )
            .map((f) => f.properties.id),
        ),
      ];
      if (ids.length) callbacks.current.onRepeaterSelect?.(ids);
    };
    const enter = () => {
        m.getCanvas().style.cursor = "pointer";
      },
      leave = () => {
        m.getCanvas().style.cursor = callbacks.current.movingPinId
          ? "crosshair"
          : "";
      };
    m.on("click", "repeater-clusters", clickCluster);
    m.on("click", "repeater-points", clickPoint);
    for (const id of ["repeater-clusters", "repeater-points"]) {
      m.on("mouseenter", id, enter);
      m.on("mouseleave", id, leave);
    }
    return () => {
      if (mapRef.current !== m) return;
      m.off("click", "repeater-clusters", clickCluster);
      m.off("click", "repeater-points", clickPoint);
      for (const id of ["repeater-clusters", "repeater-points"]) {
        m.off("mouseenter", id, enter);
        m.off("mouseleave", id, leave);
      }
      REPEATER_LAYERS.forEach((id) => {
        if (m.getLayer(id)) m.removeLayer(id);
      });
      if (m.getSource("repeaters")) m.removeSource("repeaters");
    };
  }, [ready, repeaters]);
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready || !m.getLayer("repeater-points")) return;
    m.setPaintProperty("repeater-points", "circle-radius", [
      "case",
      ["==", ["get", "id"], selectedId || ""],
      9,
      6,
    ]);
    m.setPaintProperty("repeater-points", "circle-stroke-color", [
      "case",
      ["==", ["get", "id"], selectedId || ""],
      "#ffffff",
      "#171f17",
    ]);
  }, [ready, repeaters, selectedId]);
}
