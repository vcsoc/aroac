import { useEffect, useRef, useState } from "react";
import sources from "../shared/sources.json";
export default function SpecialistViews() {
  const [selected, setSelected] = useState(null),
    [status, setStatus] = useState(""),
    [revision, setRevision] = useState(0);
  const host = useRef(),
    source = sources.find((s) => s.id === selected);
  useEffect(() => {
    if (!source || !window.oarDesktop) return;
    let live = true,
      lastBounds = "";
    host.current?.scrollIntoView({ block: "nearest" });
    setStatus("Loading provider…");
    const sync = async () => {
      if (!host.current) return;
      const r = host.current.getBoundingClientRect();
      const hidden =
        !!document.querySelector(
          "dialog[open],[popover]:popover-open,.address-dropdown [role=listbox],.floating-list-menu,.account-menu,.oar-tooltip,.oar-toast",
        ) ||
        r.bottom < 34 ||
        r.top > innerHeight;
      const signature = JSON.stringify([hidden, r.x, r.y, r.width, r.height]);
      if (signature === lastBounds) return;
      lastBounds = signature;
      try {
        if (hidden) {
          await window.oarDesktop.specialist("hide");
          return;
        }
        const result = await window.oarDesktop.specialist("show", source.id, {
          x: r.x,
          y: Math.max(34, r.y),
          width: r.width,
          height: Math.max(1, Math.min(r.height, innerHeight - r.y)),
        });
        if (live && result.error) setStatus(result.error);
      } catch (e) {
        if (live) setStatus(e.message);
      }
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    const ro = new ResizeObserver(sync);
    ro.observe(host.current);
    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    sync();
    const poll = setInterval(async () => {
      try {
        const result = await window.oarDesktop.specialist("status");
        if (live)
          setStatus(
            result.error ||
              (result.loading
                ? "Loading provider…"
                : result.url
                  ? "Live provider website · isolated from your station data"
                  : ""),
          );
      } catch {}
    }, 1500);
    return () => {
      live = false;
      ro.disconnect();
      observer.disconnect();
      clearInterval(poll);
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
      window.oarDesktop.specialist("close").catch(() => {});
    };
  }, [source, revision]);
  return (
    <section className="specialist-views">
      <div className="section-title compact">
        <h3>Specialist views</h3>
        <small>
          Interactive provider tools inside AROAC · internet required
        </small>
      </div>
      <div className="resource-grid">
        {sources.map((s) => (
          <button
            className="panel resource"
            key={s.id}
            aria-pressed={selected === s.id}
            onClick={() => setSelected(s.id)}
          >
            <h3>{s.title}</h3>
            <p>{s.description}</p>
          </button>
        ))}
      </div>
      {source && (
        <>
          <div className="specialist-toolbar">
            <strong>{source.title}</strong>
            <small>
              {new URL(source.url).hostname} · {status}
            </small>
            <button onClick={() => setRevision((n) => n + 1)}>
              Reload view
            </button>
            <button onClick={() => setSelected(null)}>Close view</button>
          </div>
          {window.oarDesktop ? (
            <div
              className="specialist-host"
              ref={host}
              aria-label={source.title + " embedded view"}
            />
          ) : (
            <div className="specialist-host">
              <p>
                Browser preview: providers may block frames. The installed
                desktop app uses an isolated embedded browser.
              </p>
              <iframe
                key={revision}
                title={source.title}
                src={source.url}
                sandbox="allow-scripts allow-same-origin allow-forms"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
