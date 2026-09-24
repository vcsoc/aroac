import { useEffect, useLayoutEffect, useRef, useState } from "react";

export const tutorialSteps = [
  {
    target: ".topbar",
    title: "Welcome to AROAC",
    text: "AROAC brings your station, maps, conditions and logbook into one local-first workspace. This tour only changes the view—it does not edit your saved data. Use Next and Previous to explore, or End whenever you like.",
  },
  {
    target: ".sidebar nav",
    title: "Choose a workspace",
    text: "Use Overview or World atlas for maps, Conditions for online observation tools, and Logbook for your contacts. Messaging between installations is not available yet. On narrow screens navigation is at the bottom.",
  },
  {
    target: ".topbar-search-group",
    title: "Find a place or contact",
    text: "Select the compact search field to expand it. Search saved names and callsigns, an address, or latitude/longitude. Select a result to locate it on the map. Unmatched searches may be sent to the online place provider; the clock editor has a separate offline city search.",
  },
  {
    target: "[data-tutorial='clocks']",
    title: "World clocks and home",
    text: "Double-click Home Location Time to choose your home address, city or exact saved pin. Double-click another clock to edit it, or use Add clock. Drag the timeline to compare local times and day/night across time zones; Now returns to live time. Weather observations do not move with the timeline.",
  },
  {
    target: ".world-map",
    title: "Explore the map",
    text: "Drag to explore and zoom for detail. Switch between the flat map and globe above it. Right-click a point to save a location, add a clock, or select source/destination points for link planning. Double-tap Escape to return to a world overview.",
  },
  {
    target: "[data-tutorial='location-panel']",
    view: "locations",
    title: "Home and selected location",
    text: "The left panel shows your home and selected points, local time, grid, weather and forecasts. Use Save to store a point, or Pin to keep its card while selecting another point. Each card collapses beside its title. Temporary pins last for this session. Home weather needs coordinates. Question-mark buttons explain sources and limitations.",
  },
  {
    target: "#map-drawer",
    view: "saved",
    title: "Saved locations and contacts",
    text: "The right panel stores locations and your address book on this device. Click a title to focus the map; the pencil edits a card. Move, Home and Delete are grouped on its right. Delete asks for confirmation. Use the toolbar to switch to contacts or import/export your library.",
  },
  {
    target: "#quick-switch-panel",
    view: "quick",
    title: "Choose map overlays",
    text: "Quick Switch controls the grey line, weather radar, MUF, timezone meridians, place labels and repeaters. Question-mark help explains each layer. Live online data may be unavailable offline; stale observations are labeled rather than presented as current.",
  },
  {
    target: ".topbar [aria-label='Map settings']",
    title: "Settings and appearance",
    text: "Open Settings for the Sources YAML editor, sign-in memory, text and app zoom, custom themes, and backups. Sources need compatible data formats; validation keeps the last working configuration when edits fail. Use Reset config to restore defaults. Your database and backups contain private data and are not encrypted—protect them.",
  },
  {
    target: "[data-tutorial='main']",
    view: "logbook",
    title: "Keep your QSO logbook",
    text: "Use Log contact to record the callsign, frequency, mode and UTC time. Your logbook belongs to your local profile and works offline. Export contacts as ADIF when you need to use them elsewhere.",
  },
  {
    target: "[data-tutorial='main']",
    view: "conditions",
    title: "Conditions and specialist tools",
    text: "Review space weather and observation panels here. Specialist provider websites open inside the desktop app in isolated views. They need an internet connection and follow their providers’ terms; they are not local prediction engines.",
  },
  {
    target: ".profile-button",
    title: "Your profile and help",
    text: "Select your callsign for Edit Profile, About AROAC, Logout, and Help → Tutorial. Your profile includes equipment and invoice records. About AROAC credits the developer and its Roadmap tab retrieves potential future plans from GitHub.",
  },
  {
    target: ".app-statusbar",
    title: "Version and station status",
    text: "The bottom status line always shows the installed AROAC version on the left and your callsign/grid on the right. Include the version when reporting a problem. You can return to Help → Tutorial at any time. End restores your previous workspace view.",
  },
];

export default function Tutorial({ onPrepare, onEnd }) {
  const [index, setIndex] = useState(0),
    [rect, setRect] = useState(null);
  const dialog = useRef(),
    card = useRef();
  const [cardHeight, setCardHeight] = useState(230);
  const step = tutorialSteps[index];
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  useLayoutEffect(() => {
    setRect(null);
    onPrepare(step.view || "map");
  }, [index, onPrepare, step.view]);
  useEffect(() => {
    let node, observer;
    const measure = () => {
      node = document.querySelector(step.target);
      const r = node?.getBoundingClientRect();
      setRect(
        r && r.width && r.height
          ? {
              x: Math.max(4, r.x),
              y: Math.max(4, r.y),
              width: Math.min(r.right, innerWidth - 4) - Math.max(4, r.x),
              height: Math.min(r.bottom, innerHeight - 4) - Math.max(4, r.y),
            }
          : null,
      );
    };
    const timer = setTimeout(() => {
      node = document.querySelector(step.target);
      node?.scrollIntoView({ block: "nearest", inline: "nearest" });
      measure();
      observer = new ResizeObserver(measure);
      if (node) observer.observe(node);
    }, 100);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() =>
      setCardHeight(card.current.getBoundingClientRect().height),
    );
    observer.observe(card.current);
    return () => observer.disconnect();
  }, []);
  const top =
    rect && rect.y + rect.height + cardHeight + 24 < innerHeight
      ? rect.y + rect.height + 12
      : rect && rect.y > cardHeight + 24
        ? rect.y - cardHeight - 12
        : Math.max(12, innerHeight - cardHeight - 16);
  return (
    <dialog
      ref={dialog}
      className="tutorial-dialog"
      aria-label="AROAC tutorial"
      onCancel={(e) => {
        e.preventDefault();
        onEnd();
      }}
    >
      {rect && rect.width > 0 && rect.height > 0 ? (
        <div
          className="tutorial-spotlight"
          aria-hidden="true"
          style={{
            left: rect.x - 3,
            top: rect.y - 3,
            width: rect.width + 6,
            height: rect.height + 6,
          }}
        />
      ) : (
        <div className="tutorial-shade" />
      )}
      <section ref={card} className="tutorial-card" style={{ top }}>
        <div aria-live="polite" aria-atomic="true">
          <small>
            AROAC tutorial · {index + 1} of {tutorialSteps.length}
          </small>
          <h2>{step.title}</h2>
          <p>{step.text}</p>
          {!rect && (
            <small>
              This section may be hidden at the current window size. The
              instructions still apply.
            </small>
          )}
        </div>
        <footer>
          <button disabled={index === 0} onClick={() => setIndex((v) => v - 1)}>
            Previous
          </button>
          <button onClick={onEnd}>End</button>
          <button
            className="primary"
            disabled={index === tutorialSteps.length - 1}
            onClick={() => setIndex((v) => v + 1)}
          >
            Next
          </button>
        </footer>
      </section>
    </dialog>
  );
}
