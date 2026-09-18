import { useEffect, useRef, useState } from "react";
const defaults = { left: 350, right: 340 };
function stored(side) {
  const value = Number(localStorage.getItem("oar-" + side + "-width"));
  return Number.isFinite(value) && value >= 180 && value <= 640
    ? value
    : defaults[side];
}
export function usePanelWidths(leftOpen, rightOpen) {
  const [widths, setWidths] = useState(() => ({
    left: stored("left"),
    right: stored("right"),
  }));
  const [viewport, setViewport] = useState(innerWidth);
  useEffect(() => {
    const resize = () => setViewport(innerWidth);
    addEventListener("resize", resize);
    return () => removeEventListener("resize", resize);
  }, []);
  const max = Math.min(
    640,
    Math.max(
      180,
      Math.floor(
        viewport <= 700
          ? viewport - 24
          : (viewport - 44 - 320) / (leftOpen && rightOpen ? 2 : 1),
      ),
    ),
  );
  const min = Math.min(240, max);
  const effective = (side) => Math.max(min, Math.min(widths[side], max));
  const control = (side) => ({
    side,
    width: effective(side),
    min,
    max,
    onChange: (value) => {
      const width = Math.round(Math.max(min, Math.min(max, value)));
      setWidths((w) => ({ ...w, [side]: width }));
      localStorage.setItem("oar-" + side + "-width", String(width));
    },
    onReset: () => {
      setWidths((w) => ({ ...w, [side]: defaults[side] }));
      localStorage.setItem("oar-" + side + "-width", String(defaults[side]));
    },
  });
  return {
    left: control("left"),
    right: control("right"),
    style: {
      "--left-width": effective("left") + "px",
      "--right-width": effective("right") + "px",
    },
  };
}
export function PanelResizer({ side, width, min, max, onChange, onReset }) {
  const drag = useRef(null);
  const [active, setActive] = useState(false);
  const sign = side === "left" ? 1 : -1;
  return (
    <div
      className={
        "panel-resizer panel-resizer-" + side + (active ? " dragging" : "")
      }
      role="separator"
      tabIndex={0}
      aria-label={"Resize " + side + " panel"}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(width)}
      aria-valuetext={Math.round(width) + " pixels"}
      title="Drag to resize; arrow keys adjust; double-click resets width"
      onDoubleClick={onReset}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.focus();
        drag.current = { x: e.clientX, width, pointerId: e.pointerId };
        setActive(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current)
          onChange(drag.current.width + sign * (e.clientX - drag.current.x));
      }}
      onPointerUp={(e) => {
        drag.current = null;
        setActive(false);
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        if (drag.current) onChange(drag.current.width);
        drag.current = null;
        setActive(false);
      }}
      onLostPointerCapture={() => {
        drag.current = null;
        setActive(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && drag.current) {
          e.preventDefault();
          e.stopPropagation();
          const start = drag.current;
          drag.current = null;
          onChange(start.width);
          setActive(false);
          if (e.currentTarget.hasPointerCapture(start.pointerId))
            e.currentTarget.releasePointerCapture(start.pointerId);
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          onChange(
            width +
              (e.key === "ArrowRight" ? 1 : -1) * sign * (e.shiftKey ? 30 : 10),
          );
        } else if (e.key === "Home") {
          e.preventDefault();
          onChange(min);
        } else if (e.key === "End") {
          e.preventDefault();
          onChange(max);
        }
      }}
    />
  );
}
export function PanelScrollArea({ children }) {
  const [scrolling, setScrolling] = useState(false),
    timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div
      className={"drawer-body themed-scroll" + (scrolling ? " scrolling" : "")}
      onScroll={() => {
        setScrolling(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setScrolling(false), 800);
      }}
    >
      {children}
    </div>
  );
}
