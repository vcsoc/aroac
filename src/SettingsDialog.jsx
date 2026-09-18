import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
export default function SettingsDialog({
  initialTab = "Sources",
  tabs,
  onClose,
}) {
  const host = useRef();
  const [active, setActive] = useState(initialTab);
  const names = Object.keys(tabs);
  useEffect(() => {
    const dialog = host.current;
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  const choose = (name) => {
    setActive(name);
    host.current.querySelector(`[data-settings-tab="${name}"]`)?.focus();
  };
  return (
    <dialog
      id="settings-dialog"
      ref={host}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="drawer-heading">
        <h2 id="settings-title">Settings</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close settings"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div
        role="tablist"
        aria-label="Settings sections"
        className="settings-tabs"
      >
        {names.map((name, index) => (
          <button
            key={name}
            role="tab"
            id={"settings-tab-" + name}
            data-settings-tab={name}
            aria-selected={active === name}
            aria-controls={"settings-panel-" + name}
            tabIndex={active === name ? 0 : -1}
            onClick={() => setActive(name)}
            onKeyDown={(e) => {
              let next;
              if (e.key === "ArrowRight") next = (index + 1) % names.length;
              else if (e.key === "ArrowLeft")
                next = (index + names.length - 1) % names.length;
              else if (e.key === "Home") next = 0;
              else if (e.key === "End") next = names.length - 1;
              if (next !== undefined) {
                e.preventDefault();
                choose(names[next]);
              }
            }}
          >
            {name}
          </button>
        ))}
      </div>
      {names.map((name) => (
        <section
          key={name}
          hidden={active !== name}
          className="settings-body"
          role="tabpanel"
          id={"settings-panel-" + name}
          aria-labelledby={"settings-tab-" + name}
          tabIndex={0}
        >
          {active === name ? tabs[name] : null}
        </section>
      ))}
    </dialog>
  );
}
