import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

let messages = [];
const subscribers = new Set();
const emit = () => subscribers.forEach((fn) => fn());
const subscribe = (fn) => {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
};
const snapshot = () => messages;
export function clearToasts() {
  messages = [];
  emit();
}
export function toast(message) {
  if (!message) return;
  const id = crypto.randomUUID();
  messages = [...messages.slice(-3), { id, message: String(message) }];
  emit();
  setTimeout(() => {
    messages = messages.filter((item) => item.id !== id);
    emit();
  }, 4000);
}
// Action feedback is transient; inline field validation and feed freshness remain separate.
export function useToastStatus() {
  return ["", toast];
}
export function ToastHost() {
  const items = useSyncExternalStore(subscribe, snapshot);
  const [target, setTarget] = useState(document.body);
  useEffect(() => {
    const update = () =>
      setTarget(
        [...document.querySelectorAll("dialog[open]")].at(-1) || document.body,
      );
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    update();
    return () => observer.disconnect();
  }, []);
  return createPortal(
    <div
      className="toast-stack"
      aria-live="polite"
      aria-relevant="additions"
      aria-atomic="false"
    >
      {items.map((item) => (
        <div key={item.id} className="oar-toast" role="status">
          {item.message}
        </div>
      ))}
    </div>,
    target,
  );
}
