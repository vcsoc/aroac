import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, Github, Minus, Square, X } from "lucide-react";
import Roadmap from "./Roadmap";
import LicenseView from "./LicenseView";
import { APP_VERSION } from "./version";

function Tooltip({ children, ...props }) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    el.showPopover();
    return () => {
      if (el.matches(":popover-open")) el.hidePopover();
    };
  }, []);
  return (
    <span ref={ref} popover="manual" {...props}>
      {children}
    </span>
  );
}
export function Help({ children, label = "More information" }) {
  const id = useId(),
    ref = useRef();
  const [position, setPosition] = useState(null);
  const open = () => {
    const r = ref.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(r.left, window.innerWidth - 312)),
      ...(r.bottom > window.innerHeight / 2
        ? { bottom: window.innerHeight - r.top + 6 }
        : { top: r.bottom + 6 }),
    });
  };
  useEffect(() => {
    const close = () => setPosition(null);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, []);
  return (
    <span
      className="help-tip"
      onMouseEnter={open}
      onMouseLeave={() => setPosition(null)}
    >
      <button
        ref={ref}
        type="button"
        className="icon-button"
        aria-label={label}
        aria-describedby={position ? id : undefined}
        onFocus={open}
        onBlur={() => setPosition(null)}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === "Escape" && position) {
            e.preventDefault();
            e.stopPropagation();
            setPosition(null);
          }
        }}
      >
        <CircleHelp size={14} />
      </button>
      {position &&
        createPortal(
          <Tooltip
            id={id}
            className="oar-tooltip"
            role="tooltip"
            style={position}
          >
            {children}
          </Tooltip>,
          ref.current.closest("dialog,[popover]") || document.body,
        )}
    </span>
  );
}

export function Modal({ title, children, onClose, defaultFocusRef, heading }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    defaultFocusRef?.current?.focus();
    return () => {
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="oar-dialog"
      onKeyDown={(e) => {
        if (
          defaultFocusRef &&
          ["Enter", " "].includes(e.key) &&
          !e.target.closest(
            "button, a, input, select, textarea, [contenteditable]",
          )
        ) {
          e.preventDefault();
          if (!e.repeat) defaultFocusRef.current?.click();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <header>
        <h2>{heading || title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

let queue = [],
  notify = () => {};
export function confirmAction(message) {
  return new Promise((resolve) => {
    queue.push({ message, resolve, id: crypto.randomUUID() });
    notify();
  });
}
export function ConfirmationHost() {
  const defaultButton = useRef();
  const [, refresh] = useState(0);
  useEffect(() => {
    notify = () => refresh((v) => v + 1);
    notify();
    return () => {
      notify = () => {};
    };
  }, []);
  const current = queue[0];
  if (!current) return null;
  const finish = (value) => {
    queue.shift();
    current.resolve(value);
    refresh((v) => v + 1);
  };
  return (
    <Modal
      key={current.id}
      defaultFocusRef={defaultButton}
      title="Please confirm"
      onClose={() => finish(false)}
    >
      <p>{current.message}</p>
      <footer>
        <button ref={defaultButton} autoFocus onClick={() => finish(false)}>
          Cancel
        </button>
        <button className="primary" onClick={() => finish(true)}>
          Confirm
        </button>
      </footer>
    </Modal>
  );
}
export function AboutOAR({ onClose, offline }) {
  const [tab, setTab] = useState("about");
  return (
    <Modal
      title="About AROAC"
      heading={
        <strong>AROAC · Amateur Radio Operations and Communications</strong>
      }
      onClose={onClose}
    >
      <div
        className="about-tabs"
        role="tablist"
        aria-label="About AROAC sections"
      >
        {[
          ["about", "About"],
          ["roadmap", "Roadmap"],
          ["license", "License"],
        ].map(([id, label]) => (
          <button
            key={id}
            id={"about-tab-" + id}
            role="tab"
            aria-selected={tab === id}
            aria-controls={"about-panel-" + id}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? "about"
                    : e.key === "End"
                      ? "license"
                      : ["about", "roadmap", "license"][
                          (["about", "roadmap", "license"].indexOf(tab) +
                            (e.key === "ArrowRight" ? 1 : 2)) %
                            3
                        ];
                setTab(next);
                document.getElementById("about-tab-" + next)?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={"about-panel-" + tab}
        aria-labelledby={"about-tab-" + tab}
        tabIndex={0}
      >
        {tab === "roadmap" ? (
          <Roadmap offline={offline} />
        ) : tab === "license" ? (
          <LicenseView />
        ) : (
          <>
            <p>
              <strong>
                AROAC · Amateur Radio Operations and Communications
              </strong>{" "}
              · v{APP_VERSION}
            </p>
            <p className="about-description">
              AROAC is a local-first amateur radio workspace combining world
              maps, station clocks, propagation and weather observations, saved
              locations, contacts, a logbook and equipment records. Your
              application logic and database live on this device; internet
              access supplies online maps and observations, not a separate
              account service.
            </p>
            <p className="about-developer">
              Developed by{" "}
              <a
                href="https://github.com/vcsoc"
                target="_blank"
                rel="noreferrer"
              >
                <strong>Chris Visser</strong>
              </a>
            </p>
            <p>
              <a
                href="https://github.com/vcsoc/aroac"
                target="_blank"
                rel="noreferrer"
              >
                <Github size={15} aria-hidden="true" /> github.com/vcsoc/aroac
              </a>
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
export function WindowControls() {
  const desktop = window.oarDesktop;
  if (!["win32", "darwin"].includes(desktop?.platform)) return null;
  return (
    <div className={"window-controls " + desktop.platform}>
      {[
        ["minimize", "Minimize", Minus],
        ["maximize", "Maximize or restore", Square],
        ["close", "Close AROAC", X],
      ].map(([action, label, Icon]) => (
        <button
          key={action}
          className={"icon-button window-" + action}
          aria-label={label}
          title={label}
          onClick={() => desktop.windowControl(action)}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
export function AccountMenu({
  signedIn = true,
  onSignIn,
  onEdit,
  onAbout,
  onLogout,
  onTutorial,
  onUpdates,
  onClose,
}) {
  const ref = useRef();
  const [helpOpen, setHelpOpen] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    ref.current.querySelector("button").focus();
    const close = (e) => {
      if (
        !ref.current?.contains(e.target) &&
        !e.target.closest(".profile-button")
      )
        closeRef.current();
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <div
      ref={ref}
      className="account-menu"
      role="menu"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          onClose();
          document.querySelector(".profile-button")?.focus();
        }
        if (["ArrowDown", "ArrowUp"].includes(e.key)) {
          e.preventDefault();
          const buttons = [...ref.current.querySelectorAll("button")];
          buttons[
            (buttons.indexOf(document.activeElement) +
              (e.key === "ArrowDown" ? 1 : buttons.length - 1)) %
              buttons.length
          ].focus();
        }
      }}
    >
      <button
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={helpOpen}
        onClick={() => setHelpOpen((v) => !v)}
      >
        Help <span aria-hidden="true">›</span>
      </button>
      {helpOpen && (
        <div role="menu" aria-label="Help" className="help-submenu">
          <button
            role="menuitem"
            onClick={() => {
              onClose();
              onTutorial();
            }}
          >
            Tutorial
          </button>
        </div>
      )}
      {[
        ...(signedIn ? [["Edit Profile", onEdit]] : []),
        ["About AROAC", onAbout],
        ["Check for updates", onUpdates],
        signedIn ? ["Logout", onLogout] : ["Sign in", onSignIn],
      ].map(([label, action]) => (
        <button
          role="menuitem"
          key={label}
          onClick={() => {
            onClose();
            action();
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
