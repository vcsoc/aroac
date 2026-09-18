import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownAZ,
  Layers,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { createPortal } from "react-dom";
import { alphabeticalGroup } from "./contactContext";
import { contactLocation } from "./contactLocation";
import { withTimezone } from "./locations";
export function useSavedState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v ?? initial;
    } catch {
      return initial;
    }
  });
  return [
    value,
    (next) =>
      setValue((old) => {
        const v = typeof next === "function" ? next(old) : next;
        try {
          localStorage.setItem(key, JSON.stringify(v));
        } catch {}
        return v;
      }),
  ];
}
export function prepareItems(rows, kind, pins = []) {
  const index = new Map();
  for (const pin of pins) {
    const call = pin.callsign?.trim().toUpperCase();
    if (call) index.set(call, [...(index.get(call) || []), pin]);
  }
  return rows.map((row) => {
    try {
      return {
        ...row,
        place:
          kind === "pins"
            ? withTimezone(row)
            : contactLocation(
                row,
                index.get(row.callsign?.trim().toUpperCase()) || [],
              ),
      };
    } catch (e) {
      return { ...row, locationError: e.message };
    }
  });
}
export function ItemTitle({ children, label, onFocus, onToggle }) {
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className="location-card-title"
      aria-label={label}
      title="Click to locate; double-click to expand/collapse"
      onClick={(e) => {
        clearTimeout(timer.current);
        if (e.detail === 0) onFocus();
        else if (e.detail === 1) timer.current = setTimeout(onFocus, 260);
      }}
      onDoubleClick={() => {
        clearTimeout(timer.current);
        onToggle();
      }}
    >
      {children}
    </button>
  );
}
export function CollapseButton({ collapsed, onToggle, label }) {
  const Icon = collapsed ? ChevronRight : ChevronDown;
  return (
    <button
      type="button"
      className="icon-button"
      title={(collapsed ? "Expand " : "Collapse ") + label}
      aria-label={(collapsed ? "Expand " : "Collapse ") + label}
      aria-expanded={!collapsed}
      onClick={onToggle}
    >
      <Icon size={14} />
    </button>
  );
}
export function Disclosure({ storageKey, title, children }) {
  const [closed, setClosed] = useSavedState(
    storageKey || "oar-unused-disclosure",
    false,
  );
  if (!storageKey) return children;
  return (
    <section className="saved-disclosure">
      <button
        type="button"
        className="disclosure-title"
        aria-expanded={!closed}
        onClick={() => setClosed(!closed)}
      >
        {closed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}{" "}
        {title}
      </button>
      <div hidden={!!closed}>{children}</div>
    </section>
  );
}
export default function SavedItemList({
  items,
  kind,
  children,
  activeId,
  focusRequest,
  hoveredPin,
}) {
  const [order, setOrder] = useSavedState("oar-" + kind + "-order", {
      field: "callsign",
      direction: "asc",
    }),
    [group, setGroup] = useSavedState("oar-" + kind + "-group", {
      show: false,
      field: "alphabetical",
    }),
    [collapsed, setCollapsed] = useSavedState("oar-" + kind + "-collapsed", {}),
    [closedGroups, setClosedGroups] = useSavedState(
      "oar-" + kind + "-closed-groups",
      {},
    ),
    [menu, setMenu] = useState(null),
    host = useRef(),
    menuHost = useRef();
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useEffect(() => {
    if (!menu) return;
    const reposition = () => {
      const r = host.current.getBoundingClientRect();
      const css = getComputedStyle(host.current);
      setPosition({
        ...Object.fromEntries(
          ["panel", "surface", "border", "text", "muted", "accent"].map((k) => [
            "--" + k,
            css.getPropertyValue("--" + k),
          ]),
        ),
        fontSize: css.fontSize,
        fontFamily: css.fontFamily,
        left: Math.max(8, Math.min(r.left, innerWidth - 288)),
        top: Math.max(
          8,
          Math.min(
            r.bottom + 4,
            innerHeight - (menuHost.current?.offsetHeight || 260) - 8,
          ),
        ),
      });
    };
    reposition();
    menuHost.current?.querySelector("select")?.focus();
    const observer = new ResizeObserver(reposition);
    if (menuHost.current) observer.observe(menuHost.current);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [menu]);
  useEffect(() => {
    if (!["alphabetical", "timezone"].includes(group.field))
      setGroup((g) => ({ ...g, field: "alphabetical" }));
  }, [group.field]);
  const menuOpen = useRef(menu);
  menuOpen.current = menu;
  useEffect(() => {
    const close = (e) => {
      if (
        !host.current?.contains(e.target) &&
        !menuHost.current?.contains(e.target)
      )
        setMenu(null);
    };
    const escape = (e) => {
      if (e.key === "Escape" && menuOpen.current) {
        e.preventDefault();
        e.stopPropagation();
        host.current?.querySelector('button[aria-expanded="true"]')?.focus();
        setMenu(null);
      }
    };
    document.addEventListener("click", close);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape, true);
    };
  }, []);
  const groupKey = (row) =>
    group.field === "timezone"
      ? row.place?.zone || "Unknown timezone"
      : alphabeticalGroup(row.name || row.label || row.callsign || "");
  const ordered = useMemo(() => {
    const collator = new Intl.Collator(undefined, {
      sensitivity: "base",
      numeric: true,
    });
    const field = (r) =>
      order.field === "group"
        ? groupKey(r)
        : order.field === "name"
          ? r.name || r.label || ""
          : r.callsign || "";
    return [...items].sort(
      (a, b) =>
        (order.direction === "desc" ? -1 : 1) *
          collator.compare(field(a), field(b)) || Number(a.id) - Number(b.id),
    );
  }, [items, order, group.field]);
  const groups = new Map();
  for (const item of ordered) {
    const key = group.show ? groupKey(item) : "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const entries = [...groups].sort(([a], [b]) =>
    group.show
      ? (order.direction === "desc" ? -1 : 1) *
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
      : 0,
  );
  const allClosed = items.length > 0 && items.every((row) => collapsed[row.id]);
  const handled = useRef(null);
  useEffect(() => {
    if (
      activeId != null &&
      items.some((i) => i.id === activeId) &&
      handled.current !== (focusRequest ?? activeId)
    ) {
      handled.current = focusRequest ?? activeId;
      setCollapsed((c) => ({ ...c, [activeId]: false }));
      const item = items.find((i) => i.id === activeId);
      if (item)
        setClosedGroups((c) => ({
          ...c,
          [group.field + ":" + groupKey(item)]: false,
        }));
    }
  }, [activeId, focusRequest, items, group.field]);
  const render = (item) => (
    <div key={item.id} className="scoped-record">
      <small className="record-scope">
        {item.owner == null
          ? "General · shared on this device"
          : "Private · signed-in profile"}
      </small>
      {children({
        item,
        collapsed: !!collapsed[item.id],
        onToggle: () => setCollapsed((c) => ({ ...c, [item.id]: !c[item.id] })),
      })}
    </div>
  );
  return (
    <>
      <div className="saved-list-toolbar" ref={host}>
        <button
          type="button"
          className="icon-button"
          title="Order by"
          aria-label="Order by"
          aria-expanded={menu === "order"}
          onClick={() => setMenu(menu === "order" ? null : "order")}
        >
          <ArrowDownAZ size={17} />
        </button>
        <button
          type="button"
          className="icon-button"
          title="Show/hide group headers"
          aria-label="Show group headers"
          aria-pressed={!!group.show}
          onClick={() => setGroup((g) => ({ ...g, show: !g.show }))}
        >
          <Layers size={17} />
        </button>
        <button
          type="button"
          className="group-choice"
          aria-label="Group by"
          aria-expanded={menu === "group"}
          onClick={() => setMenu(menu === "group" ? null : "group")}
        >
          {group.field === "timezone" ? "Timezone" : "Alphabetical"}{" "}
          <ChevronDown size={12} />
        </button>
        <button
          type="button"
          className="icon-button"
          title={allClosed ? "Expand all items" : "Collapse all items"}
          aria-label={allClosed ? "Expand all items" : "Collapse all items"}
          onClick={() =>
            setCollapsed((c) => ({
              ...c,
              ...Object.fromEntries(items.map((row) => [row.id, !allClosed])),
            }))
          }
        >
          {allClosed ? (
            <ChevronsUpDown size={17} />
          ) : (
            <ChevronsDownUp size={17} />
          )}
        </button>
        {menu &&
          createPortal(
            <div
              ref={menuHost}
              role="group"
              style={position}
              className="saved-list-menu floating-list-menu"
              aria-label={
                menu === "order" ? "Ordering options" : "Grouping options"
              }
            >
              {menu === "order" ? (
                <>
                  <label>
                    Order by
                    <select
                      aria-label="Order field"
                      value={order.field}
                      onChange={(e) =>
                        setOrder((o) => ({ ...o, field: e.target.value }))
                      }
                    >
                      <option value="callsign">Callsign</option>
                      <option value="name">Contact name / location name</option>
                      <option value="group">Group</option>
                    </select>
                  </label>
                  <label>
                    Direction
                    <select
                      aria-label="Order direction"
                      value={order.direction}
                      onChange={(e) =>
                        setOrder((o) => ({ ...o, direction: e.target.value }))
                      }
                    >
                      <option value="asc">Ascending (A–Z)</option>
                      <option value="desc">Descending (Z–A)</option>
                    </select>
                  </label>
                  <small>
                    With headers shown, groups are ordered first; items use the
                    selected order within each group.
                  </small>
                </>
              ) : (
                <label>
                  Group by
                  <select
                    aria-label="Group field"
                    value={
                      group.field === "timezone" ? "timezone" : "alphabetical"
                    }
                    onChange={(e) =>
                      setGroup((g) => ({
                        ...g,
                        field: e.target.value,
                        show: true,
                      }))
                    }
                  >
                    <option value="alphabetical">Alphabetical (name)</option>
                    <option value="timezone">Timezone</option>
                  </select>
                </label>
              )}
            </div>,
            document.body,
          )}
      </div>
      {entries.map(([key, rows]) => {
        const id = group.field + ":" + key,
          closed = !!closedGroups[id];
        return (
          <section className="saved-group" key={key}>
            {group.show && (
              <div
                className={
                  "saved-group-header " +
                  (hoveredPin &&
                  rows.some(
                    (r) =>
                      r.place?.lat === hoveredPin.lat &&
                      r.place?.lng === hoveredPin.lng,
                  )
                    ? "pin-hovered"
                    : "")
                }
              >
                <button
                  type="button"
                  className="group-title"
                  aria-expanded={!closed}
                  title="Double-click to expand/collapse this group"
                  onDoubleClick={() =>
                    setClosedGroups((c) => ({ ...c, [id]: !c[id] }))
                  }
                  onClick={(e) => {
                    if (e.detail === 0)
                      setClosedGroups((c) => ({ ...c, [id]: !c[id] }));
                  }}
                >
                  {key} <small>({rows.length})</small>
                </button>
                <CollapseButton
                  label={"group " + key}
                  collapsed={closed}
                  onToggle={() =>
                    setClosedGroups((c) => ({ ...c, [id]: !c[id] }))
                  }
                />
              </div>
            )}
            {(!group.show || !closed) && rows.map(render)}
          </section>
        );
      })}
    </>
  );
}
