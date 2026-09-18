import { useEffect, useRef, useState } from "react";
import { useSources } from "./Sources";
import * as maplibregl from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
// MapLibre 6 cannot infer a worker URL from an app-bundled/custom-protocol module.
maplibregl.setWorkerUrl(mapWorkerUrl);
import tzlookup from "tz-lookup";
import "maplibre-gl/dist/maplibre-gl.css";
import { maidenhead, api } from "./lib";
import { nightGeometry, emptyGeoJSON, globeOverviewZoom } from "./solar";
import { useStreetLabels, useSavedPins, useRepeaterLayer } from "./mapLayers";
import { useCityLabels } from "./cityLabels";
import RadarLegend from "./RadarLegend";
import { useMuf, useMufLayer, MufLegend } from "./MufLayer";
const meridians = {
  type: "FeatureCollection",
  features: Array.from({ length: 24 }, (_, i) => ({
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: [
        [-180 + i * 15, -85],
        [-180 + i * 15, 85],
      ],
    },
  })),
};
export default function WorldMap({
  globe = false,
  theme,
  zones = false,
  grey = true,
  greyOffset = 0,
  muf = false,
  radar = false,
  station,
  iss,
  onSelect,
  focusLocation,
  searchLocation,
  onCancelMove,
  streets = false,
  cities = false,
  pins = emptyGeoJSON.features,
  repeaters = emptyGeoJSON.features,
  selectedRepeaterId,
  movingPinId,
  onPinMove,
  onPinSelect,
  onPinHover,
  onRepeaterSelect,
  onContext,
  onContextClose,
}) {
  const sources = useSources();
  const host = useRef(),
    map = useRef(),
    callback = useRef(onSelect),
    flatCamera = useRef(null),
    previousProjection = useRef(null);
  const initial = useRef({ globe, zones, grey });
  callback.current = onSelect;
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [zoom, setZoom] = useState(1.4),
    [radarInfo, setRadarInfo] = useState(null);
  const mufState = useMuf(muf);
  useMufLayer(map, ready, muf, mufState, movingPinId);
  const interactions = useRef();
  interactions.current = {
    movingPinId,
    onPinMove,
    onPinSelect,
    onPinHover,
    onRepeaterSelect,
    onContext,
    onContextClose,
    onCancelMove,
  };
  useStreetLabels(map, ready, streets, host);
  useCityLabels(map, ready, cities, host);
  useSavedPins(map, ready, pins, interactions);
  useRepeaterLayer(
    map,
    ready,
    repeaters,
    selectedRepeaterId,
    interactions,
    host,
  );
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !theme) return;
    if (m.getLayer("night"))
      m.setPaintProperty("night", "fill-color", theme.colors.mapNight);
    if (m.getLayer("repeater-points"))
      m.setPaintProperty(
        "repeater-points",
        "circle-color",
        theme.colors.repeater,
      );
  }, [theme, ready, repeaters]);
  useEffect(() => {
    let m;
    setReady(false);
    try {
      const preferences = initial.current;
      m = new maplibregl.Map({
        container: host.current,
        transformRequest: (url, type) => ({
          url:
            type === "Glyphs" &&
            decodeURIComponent(url).endsWith("/Noto Sans Regular/0-255.pbf")
              ? new URL("./fonts/NotoSans-Regular-0-255.pbf", document.baseURI)
                  .href
              : url,
        }),
        style: {
          version: 8,
          glyphs:
            sources.mapGlyphs?.url ||
            "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
          projection: { type: preferences.globe ? "globe" : "mercator" },
          sources: {
            earth: {
              type: "raster",
              tiles: [
                sources.mapRaster?.url ||
                  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              ],
              tileSize: 256,
              attribution:
                sources.mapRaster?.attribution ||
                "Imagery © Esri, Maxar, Earthstar Geographics",
            },
            zones: { type: "geojson", data: meridians },
            night: {
              type: "geojson",
              data: preferences.grey ? nightGeometry() : emptyGeoJSON,
            },
          },
          layers: [
            {
              id: "earth",
              type: "raster",
              source: "earth",
              paint: {
                "raster-saturation": -0.45,
                "raster-brightness-max": 0.9,
              },
            },
            {
              id: "night",
              type: "fill",
              source: "night",
              paint: {
                "fill-color": "#020914",
                "fill-opacity": 0.64,
                "fill-antialias": false,
              },
            },
            {
              id: "zones",
              type: "line",
              source: "zones",
              layout: { visibility: preferences.zones ? "visible" : "none" },
              paint: {
                "line-color": "#c4ed9e",
                "line-opacity": 0.35,
                "line-width": 1,
              },
            },
          ],
        },
        center: [20, 15],
        zoom: 1.4,
        minZoom: -1.5,
        maxZoom: 19,
        renderWorldCopies: false,
        dragRotate: false,
      });
      map.current = m;
      // style.load means the style can be changed. load/isStyleLoaded also wait for
      // remote tiles and can remain pending indefinitely (especially offline).
      m.on("style.load", () => setReady(true));
      m.on("sourcedata", (e) => {
        if (e.sourceId === "night" && host.current)
          host.current.dataset.nightReady = String(m.isSourceLoaded("night"));
      });
      m.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );
      m.on("zoomend", () => setZoom(m.getZoom()));
      m.on("movestart", () => interactions.current.onContextClose?.());
      m.on("contextmenu", (e) => {
        e.preventDefault();
        e.originalEvent.preventDefault();
        if (!Number.isFinite(e.lngLat.lat) || !Number.isFinite(e.lngLat.lng))
          return;
        const projected = m.project(e.lngLat);
        if (
          m.getProjection()?.type === "globe" &&
          Math.hypot(projected.x - e.point.x, projected.y - e.point.y) > 2
        )
          return;
        const { lat, lng } = e.lngLat.wrap();
        interactions.current.onContext?.({
          x: e.originalEvent.clientX,
          y: e.originalEvent.clientY,
          lat,
          lng,
        });
      });
      m.on("click", (e) => {
        const { lat, lng } = e.lngLat.wrap();
        if (interactions.current.movingPinId) {
          interactions.current
            .onPinMove?.(interactions.current.movingPinId, { lat, lng })
            .catch(() => {});
          return;
        }
        const interactive = [
          "repeater-clusters",
          "repeater-points",
          "muf-observations",
          "muf-labels",
        ].filter((id) => m.getLayer(id));
        if (
          interactive.length &&
          m.queryRenderedFeatures(e.point, { layers: interactive }).length
        )
          return;
        let zone = "UTC";
        try {
          zone = tzlookup(lat, lng);
        } catch {}
        callback.current?.({ lat, lng, zone, grid: maidenhead(lat, lng) });
      });
      m.on("error", (e) =>
        setError(
          e.sourceId === "earth"
            ? "Imagery unavailable — map controls and the calculated grey line still work."
            : "A map source could not load.",
        ),
      );
      m.on("idle", () => {
        if (m.areTilesLoaded()) setError("");
      });
    } catch {
      setError(
        "This device could not start the WebGL map. World clocks remain available.",
      );
    }
    const ro = new ResizeObserver(() => m?.resize());
    ro.observe(host.current);
    return () => {
      ro.disconnect();
      m?.remove();
      map.current = null;
      previousProjection.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (sources.mapRaster) {
      const source = m.getSource("earth");
      if (source) {
        source.attribution = sources.mapRaster.attribution;
        source.setTiles([sources.mapRaster.url]);
      }
    }
    if (sources.mapGlyphs) m.setGlyphs(sources.mapGlyphs.url);
  }, [ready, sources.mapRaster, sources.mapGlyphs]);
  useEffect(() => {
    if (map.current)
      map.current.getCanvas().style.cursor = movingPinId ? "crosshair" : "";
  }, [movingPinId]);
  useEffect(() => {
    let last = 0;
    const key = (e) => {
      const m = map.current;
      if (!m) return;
      if (e.key !== "Escape") {
        delete m.getCanvas().dataset.escapeFocus;
        last = 0;
        return;
      }
      m.getCanvas().dataset.escapeFocus = "true";
      if (!ready || e.repeat) return;
      if (document.querySelector("dialog[open],[popover]:popover-open")) {
        last = 0;
        return;
      }
      interactions.current.onCancelMove?.();
      const now = performance.now();
      if (last && now - last <= 650) {
        last = 0;
        e.preventDefault();
        m.stop();
        m.resize();
        const flat = {
          center: [0, 15],
          zoom: Math.max(
            -1.5,
            Math.log2(
              Math.min(host.current.clientWidth, host.current.clientHeight) /
                512,
            ),
          ),
          bearing: 0,
          pitch: 0,
        };
        flatCamera.current = flat;
        m.easeTo({
          ...flat,
          zoom:
            m.getProjection().type === "globe"
              ? globeOverviewZoom(
                  host.current.clientWidth,
                  host.current.clientHeight,
                )
              : flat.zoom,
          duration: 450,
          essential: false,
        });
        host.current.dataset.overviewResets = String(
          Number(host.current.dataset.overviewResets || 0) + 1,
        );
      } else last = now;
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [ready]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const type = globe ? "globe" : "mercator";
    if (previousProjection.current !== type) {
      if (globe)
        flatCamera.current = {
          center: m.getCenter(),
          zoom: m.getZoom(),
          bearing: m.getBearing(),
          pitch: m.getPitch(),
        };
      m.setProjection({ type });
      if (globe)
        m.jumpTo({
          zoom: globeOverviewZoom(
            host.current.clientWidth,
            host.current.clientHeight,
          ),
          pitch: 0,
          bearing: 0,
        });
      else if (flatCamera.current) m.jumpTo(flatCamera.current);
      previousProjection.current = type;
    }
    host.current.dataset.projection = m.getProjection().type;
  }, [globe, ready]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    m.setLayoutProperty("zones", "visibility", zones ? "visible" : "none");
    host.current.dataset.timezones = String(zones);
    if (!zones) return;
    const markers = [];
    for (let offset = -11; offset <= 12; offset++) {
      const element = document.createElement("span");
      element.className = "timezone-map-label";
      element.textContent =
        "UTC" + (offset === 0 ? "" : offset > 0 ? "+" + offset : offset);
      element.title =
        "Nominal time meridian; actual civil timezone boundaries differ.";
      markers.push(
        new maplibregl.Marker({ element, opacityWhenCovered: 0 })
          .setLngLat([offset * 15, 0])
          .addTo(m),
      );
    }
    return () => markers.forEach((marker) => marker.remove());
  }, [zones, ready]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (!focusLocation) {
      host.current.dataset.selectedLocation = "";
      return;
    }
    const { lng, lat, zoom = 12 } = focusLocation;
    m.resize();
    m.flyTo({ center: [lng, lat], zoom, duration: 700, essential: false });
    host.current.dataset.selectedLocation = `${lat},${lng}`;
  }, [focusLocation, ready]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !["contact", "home"].includes(focusLocation?.kind))
      return;
    const element = document.createElement("div");
    element.className = "search-pin " + focusLocation.kind + "-location-marker";
    element.setAttribute("role", "img");
    element.setAttribute(
      "aria-label",
      (focusLocation.kind === "home" ? "Home location " : "Selected contact ") +
        focusLocation.title,
    );
    const label = document.createElement("span");
    label.className = "contact-location-label";
    label.textContent = focusLocation.title;
    element.appendChild(label);
    const marker = new maplibregl.Marker({ element, opacityWhenCovered: 0 })
      .setLngLat([focusLocation.lng, focusLocation.lat])
      .addTo(m);
    return () => marker.remove();
  }, [focusLocation, ready]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !searchLocation) return;
    const element = document.createElement("div");
    element.className = "search-pin";
    element.title = searchLocation.title || "Searched location";
    const label = document.createElement("span");
    label.className = "searched-place-label";
    label.textContent = element.title;
    element.appendChild(label);
    const marker = new maplibregl.Marker({ element, opacityWhenCovered: 0 })
      .setLngLat([searchLocation.lng, searchLocation.lat])
      .addTo(m);
    return () => marker.remove();
  }, [ready, searchLocation]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const update = () => {
      const instant = new Date(Date.now() + greyOffset * 60000);
      const data = grey ? nightGeometry(instant) : emptyGeoJSON;
      host.current.dataset.nightTime = instant.toISOString();
      host.current.dataset.nightOffset = String(greyOffset);
      m.getSource("night").setData(data);
      host.current.dataset.nightFeatures = String(data.features.length);
    };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, [grey, ready, greyOffset]);
  useEffect(() => {
    if (!map.current || !station) return;
    const el = document.createElement("div");
    el.className = "station-pin";
    el.title = "Your station";
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([station.lng, station.lat])
      .addTo(map.current);
    return () => marker.remove();
  }, [station?.lat, station?.lng]);
  useEffect(() => {
    if (!map.current || !iss) return;
    const el = document.createElement("div");
    el.className = "iss-pin";
    el.textContent = "✦ ISS";
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([iss.longitude, iss.latitude])
      .addTo(map.current);
    return () => marker.remove();
  }, [iss]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    let cancelled = false;
    const update = async () => {
      if (!radar) {
        setRadarInfo(null);
        if (m.getLayer("radar")) m.removeLayer("radar");
        if (m.getSource("radar")) m.removeSource("radar");
        return;
      }
      try {
        const { data, stale, offline } = await api("/feeds/radar");
        const frame = data.radar?.past?.at(-1);
        if (!frame) throw Error("No radar frame");
        if (cancelled) return;
        setRadarInfo({
          time: Number.isFinite(frame.time) ? frame.time : null,
          stale: !!(stale || offline),
        });
        if (m.getLayer("radar")) m.removeLayer("radar");
        if (m.getSource("radar")) m.removeSource("radar");
        m.addSource("radar", {
          type: "raster",
          tiles: [`${data.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`],
          tileSize: 256,
          maxzoom: 7,
          attribution: "Radar © RainViewer",
        });
        m.addLayer(
          {
            id: "radar",
            type: "raster",
            source: "radar",
            paint: { "raster-opacity": 0.7 },
          },
          "zones",
        );
      } catch {
        if (!cancelled)
          setRadarInfo((previous) => ({
            ...previous,
            error: "Radar source unavailable",
            stale: true,
          }));
      }
    };
    update();
    const timer = setInterval(update, 300000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [radar, ready]);
  return (
    <>
      <div ref={host} className="world-map" data-ready={ready} />
      {radar && <RadarLegend info={radarInfo} />}
      {muf && <MufLegend state={mufState} />}
      {streets && zoom < 12 && (
        <div className="street-hint">Zoom in for street names</div>
      )}
      {error && (
        <div className="map-error" role="status">
          {error}
        </div>
      )}
    </>
  );
}
