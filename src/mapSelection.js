import { useEffect } from "react";
import { Marker } from "maplibre-gl";
import { SELECTED_SAVED_COLOR } from "./locationColors";
import "./map-selection.css";

export function useMapSelection(
  map,
  ready,
  location,
  selected = [],
  activePinId,
) {
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const points = selected.length
      ? selected.filter(
          (item) => !(item.place.id === activePinId && !item.locked),
        )
      : location
        ? [{ place: location }]
        : [];
    const markers = points
      .filter(
        ({ place }) => Number.isFinite(place.lat) && Number.isFinite(place.lng),
      )
      .map(({ place, locked, color }) => {
        const element = document.createElement(locked ? "div" : "img");
        element.className =
          "clicked-location-marker" + (locked ? " linked-location-marker" : "");
        if (locked) {
          element.style.setProperty(
            "--location-link-color",
            place.id === activePinId ? SELECTED_SAVED_COLOR : color,
          );
          element.setAttribute("role", "img");
          element.setAttribute(
            "aria-label",
            `Pinned location ${place.lat.toFixed(6)}, ${place.lng.toFixed(6)}`,
          );
          element.title = place.name || place.title || "Pinned location";
        } else {
          element.src = new URL(
            "./map-markers/click-location.png",
            document.baseURI,
          ).href;
          element.alt = `Clicked location ${place.lat.toFixed(6)}, ${place.lng.toFixed(6)}`;
          element.draggable = false;
        }
        return new Marker({
          element,
          anchor: "bottom",
          opacityWhenCovered: 0,
          subpixelPositioning: true,
        })
          .setLngLat([place.lng, place.lat])
          .addTo(m);
      });
    if (location)
      m.getContainer().dataset.clickedLocation = `${location.lat},${location.lng}`;
    return () => markers.forEach((marker) => marker.remove());
  }, [map, ready, location, selected, activePinId]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const container = m.getContainer();
    let dragging = false,
      rotating = false;
    const update = () => {
      container.dataset.mapDragging = String(dragging || rotating);
    };
    const dragStart = () => {
      dragging = true;
      update();
    };
    const dragEnd = () => {
      dragging = false;
      update();
    };
    const rotateStart = (event) => {
      if (event.originalEvent) {
        rotating = true;
        update();
      }
    };
    const rotateEnd = () => {
      rotating = false;
      update();
    };
    const reset = () => {
      dragging = rotating = false;
      update();
    };
    const size = () => {
      const zoom = m.getZoom();
      const height = Math.max(26, Math.min(42, 26 + zoom * 1.1));
      container.style.setProperty("--clicked-marker-height", `${height}px`);
      // Chromium does not resolve length * number inside calc() for this marker.
      container.style.setProperty(
        "--clicked-marker-width",
        `${height * 0.75}px`,
      );
      container.dataset.cursorSize = zoom < 5 ? "24" : zoom < 11 ? "28" : "32";
    };
    size();
    reset();
    m.on("zoom", size);
    m.on("dragstart", dragStart);
    m.on("dragend", dragEnd);
    m.on("rotatestart", rotateStart);
    m.on("rotateend", rotateEnd);
    window.addEventListener("blur", reset);
    window.addEventListener("pointerup", reset);
    window.addEventListener("pointercancel", reset);
    return () => {
      m.off("zoom", size);
      m.off("dragstart", dragStart);
      m.off("dragend", dragEnd);
      m.off("rotatestart", rotateStart);
      m.off("rotateend", rotateEnd);
      window.removeEventListener("blur", reset);
      window.removeEventListener("pointerup", reset);
      window.removeEventListener("pointercancel", reset);
    };
  }, [map, ready]);
}
