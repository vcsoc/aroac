import { useEffect, useRef } from "react";
import { X } from "lucide-react";
export default function QuickSwitch({ children, onClose }) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current,
      previous = document.activeElement;
    el.showPopover();
    el.querySelector("button")?.focus();
    return () => {
      const restore =
        el.contains(document.activeElement) ||
        document.activeElement === document.body;
      if (el.matches(":popover-open")) el.hidePopover();
      if (restore) previous?.focus();
    };
  }, []);
  return (
    <section
      ref={ref}
      id="quick-switch-panel"
      popover="auto"
      className="quick-switch-panel"
      aria-label="Quick Switch"
      onToggle={(e) => {
        if (e.newState === "closed") onClose();
      }}
    >
      <header className="drawer-heading">
        <h2>Quick Switch</h2>
        <button
          className="icon-button"
          aria-label="Close Quick Switch"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="quick-switch-body">{children}</div>
    </section>
  );
}
