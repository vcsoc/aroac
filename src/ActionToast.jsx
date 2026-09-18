import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
export default function ActionToast({ children, label }) {
  const [target, setTarget] = useState(
    () =>
      [...document.querySelectorAll("dialog[open]")].at(-1) || document.body,
  );
  useEffect(() => {
    const update = () =>
      setTarget(
        [...document.querySelectorAll("dialog[open]")].at(-1) || document.body,
      );
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => observer.disconnect();
  }, []);
  return createPortal(
    <ToastSurface
      key={target === document.body ? "body" : target.className}
      label={label}
    >
      {children}
    </ToastSurface>,
    target,
  );
}
function ToastSurface({ children, label }) {
  const ref = useRef();
  useEffect(() => {
    const node = ref.current;
    node.showPopover();
    return () => {
      if (node.matches(":popover-open")) node.hidePopover();
    };
  }, []);
  return (
    <section
      popover="manual"
      ref={ref}
      className="action-toast"
      aria-label={label}
    >
      <div role="status" aria-live="polite">
        {children}
      </div>
    </section>
  );
}
