import { useEffect } from "react";
import { Marker } from "maplibre-gl";
import "./map-selection.css";

export function useMapSelection(map, ready, location) {
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !location) return;
    const element = document.createElement("img");
    element.className = "clicked-location-marker";
    element.src = new URL(
      "./map-markers/click-location.png",
      document.baseURI,
    ).href;
    element.alt = `Clicked location ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
    element.draggable = false;
    const marker = new Marker({
      element,
      anchor: "bottom",
      opacityWhenCovered: 0,
      subpixelPositioning: true,
    })
      .setLngLat([location.lng, location.lat])
      .addTo(m);
    m.getContainer().dataset.clickedLocation = `${location.lat},${location.lng}`;
    return () => marker.remove();
  }, [map, ready, location]);

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
