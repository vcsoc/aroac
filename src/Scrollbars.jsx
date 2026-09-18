import { useEffect } from "react";
// Capture scroll events from every OAR-owned scroll surface, including portals.
// Third-party specialist WebViews and native OS dialogs retain their own styles.
export default function Scrollbars() {
  useEffect(() => {
    const timers = new Map();
    const scroll = (e) => {
      const element =
        e.target === document ? document.documentElement : e.target;
      if (!(element instanceof Element)) return;
      element.classList.add("oar-scrolling");
      clearTimeout(timers.get(element));
      timers.set(
        element,
        setTimeout(() => {
          element.classList.remove("oar-scrolling");
          timers.delete(element);
        }, 800),
      );
    };
    document.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("scroll", scroll, true);
      for (const [el, timer] of timers) {
        clearTimeout(timer);
        el.classList.remove("oar-scrolling");
      }
    };
  }, []);
  return null;
}
