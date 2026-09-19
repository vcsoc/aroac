import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from "react";
import {
  Radio,
  LayoutDashboard,
  Globe2,
  CloudSun,
  MessageSquare,
  BookOpen,
  Settings,
  SlidersHorizontal,
  ArrowUpRight,
  Plus,
  Search,
  Camera,
  CircleHelp,
  Send,
  Download,
  LogOut,
  X,
  Satellite,
  Sun,
  Activity,
  MapPin,
  MapPinned,
  Home,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { api, post, gridCenter, invalidateSessionRequests } from "./lib";
import LinkPlanner from "./LinkPlanner";
import Tutorial from "./Tutorial";
import { toast, ToastHost, clearToasts } from "./Toasts";
import { APP_VERSION } from "./version";
import SourcesEditor, { SourceHost } from "./Sources";
import UpdateNotice, { checkForUpdates } from "./Updates";
import { useSourceRevision } from "./sourceEvents";
import {
  AboutOAR,
  Help,
  AccountMenu,
  WindowControls,
  ConfirmationHost,
  confirmAction,
} from "./InterfaceUI";
import { PanelLeft, Info } from "lucide-react";
import AccountPanel from "./AccountPanel";
import { Auth, Messages, Logbook, Profile } from "./Station.jsx";
import LocalData from "./LocalData.jsx";
import RelayPanel from "./RelayPanel.jsx";
import AddressSearch from "./AddressSearch.jsx";
import { isNative, connection } from "./platform.js";
import { usePreference, usePins, useRepeaters, NO_REPEATERS } from "./mapState";
import {
  MapDrawer,
  MapSettings,
  Switch,
  SavedPins,
  RepeaterDetails,
} from "./MapPanels";
import MapContextMenu from "./MapContextMenu";
import { contactLocation } from "./contactLocation";
import MapToolbar from "./MapToolbar";
import QuickSwitch from "./QuickSwitch";
import { usePanelWidths } from "./PanelLayout";
import LoginSettings from "./LoginSettings";
import AppearanceSettings from "./AppearanceSettings";
import { defaultAppearance } from "../shared/appearance";
import { WorldTime, placeFromLocation } from "./WorldTime";
import LocationDetails, { WeatherSwitch } from "./LocationDetails";
import SettingsDialog from "./SettingsDialog";
import ThemeEditor, { themeStyle } from "./ThemeEditor";
import LibraryContacts, { LibraryTransfer } from "./LibraryPanel";
import SpecialistViews from "./SpecialistViews";
import { useWorkspaceSetting } from "./workspaceState";
import { defaultTheme, defaultTimeConfig } from "../shared/workspace";
import { withTimezone } from "./locations";
const WorldMap = lazy(() => import("./WorldMap.jsx"));
const nav = [
  ["dashboard", "Overview", LayoutDashboard],
  ["atlas", "World atlas", Globe2],
  ["conditions", "Conditions", CloudSun],
  ["messages", "Messages", MessageSquare],
  ["logbook", "Logbook", BookOpen],
];
export function useFeed(name, interval = 300000) {
  const sourceRevision = useSourceRevision();
  const [value, setValue] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const load = () =>
      api("/feeds/" + name)
        .then((v) => {
          if (live) {
            setValue(v);
            setError(v.stale ? "Cached · source unavailable" : "");
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    load();
    const id = setInterval(load, interval);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [name, interval, sourceRevision]);
  return { value, error };
}
function ImageFeed({ title, subtitle, url, source }) {
  const [failed, setFailed] = useState(false),
    [version, setVersion] = useState(0);
  return (
    <article className="panel image-feed">
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
          <small>{subtitle}</small>
        </div>
        <button
          className="icon-button"
          aria-label={"Refresh " + title}
          onClick={() => {
            setFailed(false);
            setVersion(Date.now());
          }}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      {failed ? (
        <div className="feed-unavailable">
          Image feed unavailable
          <br />
          <small>Open the source to check its status.</small>
        </div>
      ) : (
        <a href={source} target="_blank" rel="noreferrer">
          <img
            loading="lazy"
            src={url + (version ? "?t=" + version : "")}
            onError={() => setFailed(true)}
            alt={title + " · latest available provider image"}
          />
        </a>
      )}
      <a className="source" href={source} target="_blank" rel="noreferrer">
        Provider image · check timestamp <ArrowUpRight size={13} />
      </a>
    </article>
  );
}
function Conditions() {
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">ENVIRONMENT / PROPAGATION</span>
          <h2>Know the conditions.</h2>
          <p>Provider imagery and specialist tools, in one place.</p>
        </div>
      </div>
      <div className="feed-grid">
        <ImageFeed
          title="D-region absorption"
          subtitle="NOAA SWPC · D-RAP"
          url="https://services.swpc.noaa.gov/images/animations/d-rap/global/latest.png"
          source="https://www.swpc.noaa.gov/products/d-region-absorption-predictions-d-rap"
        />
        <ImageFeed
          title="Continental radar"
          subtitle="NOAA / NWS · United States"
          url="https://radar.weather.gov/ridge/standard/CONUS-LARGE_0.gif"
          source="https://radar.weather.gov/"
        />
        <ImageFeed
          title="Great Lakes satellite"
          subtitle="NOAA GOES East · GeoColor"
          url="https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/cgl/GEOCOLOR/latest.jpg"
          source="https://www.star.nesdis.noaa.gov/GOES/sector.php?sat=G19&sector=cgl"
        />
        <ImageFeed
          title="North American satellite"
          subtitle="NOAA GOES East · continental view"
          url="https://cdn.star.nesdis.noaa.gov/GOES19/ABI/CONUS/GEOCOLOR/latest.jpg"
          source="https://www.star.nesdis.noaa.gov/GOES/conus.php?sat=G19"
        />
      </div>
      <SpecialistViews />
      <p className="disclaimer">
        Imagery coverage and website availability vary by provider. Specialist
        tools open inside OAR’s isolated browser; they require internet. Never
        use OAR as a safety-critical weather service.
      </p>
    </>
  );
}
function SpaceStats({ kp, solar, iss }) {
  const row = kp.value?.data?.at(-1);
  const k = row && (Array.isArray(row) ? row : [row.time_tag, row.Kp]);
  const s = solar.value?.data?.find((x) => x.flux);
  return (
    <div className="stats-grid">
      <article className="panel stat">
        <span>
          <Activity size={17} /> PLANETARY K-INDEX
        </span>
        <strong>
          {k?.[1] ?? "—"}
          <em>
            {k
              ? Number(k[1]) < 4
                ? "Quiet"
                : Number(k[1]) < 5
                  ? "Active"
                  : "Storm"
              : "NO DATA"}
          </em>
        </strong>
        <small>
          {kp.error || (k ? `${k[0]} UTC · NOAA` : "Connecting to NOAA…")}
        </small>
      </article>
      <article className="panel stat">
        <span>
          <Sun size={17} /> SOLAR FLUX
        </span>
        <strong>
          {s ? Math.round(s.flux) : "—"}
          <em>SFU</em>
        </strong>
        <small>
          {solar.error ||
            (s
              ? `${s.time_tag?.slice(0, 10)} · NOAA 10.7 cm`
              : "Connecting to NOAA…")}
        </small>
      </article>
      <article className="panel stat">
        <span>
          <Satellite size={17} /> ISS ALTITUDE
        </span>
        <strong>
          {iss.value ? Math.round(iss.value.data.altitude) : "—"}
          <em>km</em>
        </strong>
        <small>
          {iss.error ||
            (iss.value
              ? `${iss.value.data.visibility} · ${new Date(iss.value.data.timestamp * 1000).toLocaleTimeString()}`
              : "Acquiring orbital position…")}
        </small>
      </article>
    </div>
  );
}
function Atlas({
  user,
  full,
  iss,
  zones,
  focusLocation,
  searchLocation,
  onLocationSelect,
  theme,
  grey,
  greyOffset,
  muf,
  radar,
  cities,
  streets,
  pins,
  repeaters,
  selectedRepeaterId,
  movingPinId,
  onPinMove,
  onPinSelect,
  onRepeaterSelect,
  onContext,
  onPinHover,
  onContextClose,
  onCancelMove,
  onHome,
  homeReady,
}) {
  const [globe, setGlobe] = useState(false);
  return (
    <article className={"panel atlas " + (full ? "atlas-full" : "")}>
      <div className="panel-heading">
        <div>
          <h3>{full ? "World atlas" : "Your window to the world"}</h3>
          <small>
            {full
              ? "Explore time, location and propagation"
              : "DAY / NIGHT · STATION · ORBIT"}
          </small>
        </div>
        <WeatherSwitch
          label="Map projection"
          hideLabel
          checked={globe}
          onChange={setGlobe}
          labels={["Flat map", "Globe"]}
        />
      </div>
      <div className="map-wrap">
        <Suspense fallback={<div className="empty">Loading atlas…</div>}>
          <WorldMap
            globe={globe}
            focusLocation={focusLocation}
            searchLocation={searchLocation}
            onCancelMove={onCancelMove}
            grey={grey}
            greyOffset={greyOffset}
            muf={muf}
            zones={zones}
            radar={radar}
            station={user?.grid ? gridCenter(user.grid) : null}
            iss={iss.value?.data}
            onSelect={onLocationSelect}
            theme={theme}
            streets={streets}
            cities={cities}
            pins={pins}
            repeaters={repeaters}
            selectedRepeaterId={selectedRepeaterId}
            movingPinId={movingPinId}
            onPinMove={onPinMove}
            onPinSelect={onPinSelect}
            onRepeaterSelect={onRepeaterSelect}
            onContext={onContext}
            onPinHover={onPinHover}
            onContextClose={onContextClose}
          />
        </Suspense>
        <button
          type="button"
          className="map-home-control"
          disabled={!homeReady}
          aria-label="Go to home location"
          title="Go to home location (configure Home Location Time if unset)"
          onClick={onHome}
        >
          <Home size={18} />
        </button>
        <div className="map-badge">
          <span className="dot" />{" "}
          {grey && greyOffset
            ? "EARTH / DAY-NIGHT PREVIEW"
            : "EARTH / LIVE CONTEXT"}
        </div>
        <div className="map-instruction">
          <Help label="About map navigation">
            Drag to explore · right-click to save a location · drag saved pins
            to move them · Esc twice: world overview
          </Help>
        </div>
        {movingPinId && (
          <div className="move-pin-prompt" role="status">
            Click the new position for this pin.{" "}
            <button onClick={onCancelMove}>Cancel</button>
          </div>
        )}
      </div>
    </article>
  );
}
export default function App() {
  const [session, setSession] = useState(undefined);
  const [page, setPage] = useState("dashboard");
  const identity = useRef(undefined);
  const change = useCallback((value) => {
    const id = value?.id ?? null;
    if (identity.current !== id) {
      invalidateSessionRequests();
      clearToasts();
      identity.current = id;
    }
    setSession(value);
  }, []);
  useEffect(() => {
    let live = true;
    api("/me")
      .then((value) => {
        if (live) change(value);
      })
      .catch(() => {
        if (live) change(null);
      });
    return () => {
      live = false;
    };
  }, [change]);
  if (session === undefined)
    return <p role="status">Opening your local workspace…</p>;
  return (
    <Workspace
      key={session?.id ?? "general"}
      user={session}
      setUser={change}
      page={page}
      setPage={setPage}
    />
  );
}
function Workspace({ user, setUser, page, setPage }) {
  const [auth, setAuth] = useState(false),
    [accountScreen, setAccountScreen] = useState(null),
    [accountMenu, setAccountMenu] = useState(false),
    [aboutOpen, setAboutOpen] = useState(false),
    [tutorialOpen, setTutorialOpen] = useState(false),
    [networkOnline, setOnline] = useState(navigator.onLine),
    [forcedOffline, setForcedOffline] = useState(false),
    [mapLocation, setMapLocation] = useState(null),
    [searchLocation, setSearchLocation] = useState(null),
    [drawer, setDrawer] = useState(() =>
      localStorage.getItem("oar-right-pinned") === "true" ? "pins" : null,
    ),
    [leftOpen, setLeftOpen] = useState(
      () => localStorage.getItem("oar-left-pinned") === "true",
    ),
    [selectedLocations, setSelectedLocations] = useState([]),
    [clockEdit, setClockEdit] = useState(null),
    [clockOffset, setClockOffset] = useState(0),
    [settingsOpen, setSettingsOpen] = useState(null),
    [quickOpen, setQuickOpen] = useState(false),
    [previewTheme, setPreviewTheme] = useState(null),
    [previewFont, setPreviewFont] = useState(null),
    [libraryTab, setLibraryTab] = useState("pins"),
    [libraryRevision, setLibraryRevision] = useState(0),
    [mapContext, setMapContext] = useState(null),
    [linkSource, setLinkSource] = useState(null),
    [linkDestination, setLinkDestination] = useState(null),
    [hoveredPin, setHoveredPin] = useState(null),
    [activePinId, setActivePinId] = useState(null),
    [editingPinId, setEditingPinId] = useState(null),
    [activeContactId, setActiveContactId] = useState(null),
    [movingPinId, setMovingPinId] = useState(null),
    [repeaterIds, setRepeaterIds] = useState([]),
    [activeRepeaterId, setActiveRepeaterId] = useState(null);
  const setNotice = toast;
  const tutorialSnapshot = useRef(null);
  const startTutorial = () => {
    tutorialSnapshot.current = {
      page,
      drawer,
      leftOpen,
      settingsOpen,
      quickOpen,
      libraryTab,
    };
    setAccountScreen(null);
    setAboutOpen(false);
    setClockEdit(null);
    setMapContext(null);
    setTutorialOpen(true);
  };
  const prepareTutorial = useCallback((view) => {
    setPage(view === "logbook" || view === "conditions" ? view : "atlas");
    setLeftOpen(view === "locations");
    setDrawer(view === "saved" ? "pins" : null);
    if (view === "saved") setLibraryTab("pins");
    setQuickOpen(view === "quick");
    setSettingsOpen(null);
  }, []);
  const endTutorial = () => {
    setTutorialOpen(false);
    const previous = tutorialSnapshot.current;
    if (previous) {
      setPage(previous.page);
      setDrawer(previous.drawer);
      setLeftOpen(previous.leftOpen);
      setSettingsOpen(previous.settingsOpen);
      setQuickOpen(previous.quickOpen);
      setLibraryTab(previous.libraryTab);
    }
    tutorialSnapshot.current = null;
    requestAnimationFrame(() =>
      document.querySelector(".profile-button")?.focus(),
    );
  };
  const panelWidths = usePanelWidths(leftOpen, !!drawer);
  const [muf, setMuf] = usePreference("oar-muf");
  const [followGrey, setFollowGrey] = usePreference(
    "oar-grey-follow-clock",
    true,
  );
  const [leftPinned, setLeftPinned] = usePreference("oar-left-pinned");
  const [rightPinned, setRightPinned] = usePreference("oar-right-pinned");
  const timeSettings = useWorkspaceSetting("world-time", defaultTimeConfig);
  const themeSettings = useWorkspaceSetting("theme", defaultTheme);
  const appearanceSettings = useWorkspaceSetting(
    "appearance",
    defaultAppearance,
  );
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--font-scale",
      String(previewFont?.fontScale ?? appearanceSettings.value.fontScale),
    );
    document.documentElement.style.setProperty(
      "--small-font-scale",
      String(
        previewFont?.smallFontScale ??
          appearanceSettings.value.smallFontScale ??
          1,
      ),
    );
  }, [previewFont, appearanceSettings.value]);
  const theme = previewTheme || themeSettings.value;
  useEffect(() => {
    for (const [key, value] of Object.entries(themeStyle(theme)))
      document.documentElement.style.setProperty(key, value);
  }, [theme]);
  const showLocation = (location) => {
    setSelectedLocations((items) => [
      ...items.filter((item) => item.locked),
      {
        key: crypto.randomUUID(),
        place: withTimezone(location),
        locked: false,
      },
    ]);
    setLeftOpen(true);
  };
  const [grey, setGrey] = usePreference("oar-grey", true),
    [radar, setRadar] = usePreference("oar-radar");
  useEffect(() => {
    if (!window.oarDesktop) return;
    const key = (e) => {
      if (e.defaultPrevented || e.repeat || !(e.ctrlKey || e.metaKey)) return;
      const action = ["+", "="].includes(e.key)
        ? "in"
        : ["-", "_"].includes(e.key)
          ? "out"
          : e.key === "0"
            ? "reset"
            : null;
      if (action) {
        e.preventDefault();
        window.oarDesktop
          .zoomStep(action)
          .catch((error) => setNotice(error.message));
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  const [showZones, setShowZones] = usePreference("oar-timezones");
  const [showStreets, setShowStreets] = usePreference("oar-streetnames");
  const [showCities, setShowCities] = usePreference("oar-citynames");
  const [showRepeaters, setShowRepeaters] = usePreference("oar-repeaters");
  const pinStore = usePins(),
    directory = useRepeaters(showRepeaters);
  const matches = useMemo(() => {
    const ids = new Set(repeaterIds);
    return (directory.value?.repeaters || []).filter((r) => ids.has(r.id));
  }, [directory.value, repeaterIds]);
  const selectedRepeater =
    matches.find((r) => r.id === activeRepeaterId) || matches[0];
  useEffect(() => {
    if (mapLocation && !mapLocation.focusOnly) showLocation(mapLocation);
  }, [mapLocation]);
  useEffect(() => {
    if (!["dashboard", "atlas"].includes(page) && !leftPinned)
      setLeftOpen(false);
  }, [page, leftPinned]);
  const closeContext = useCallback(() => setMapContext(null), []);
  const toggleDrawer = (kind) =>
    kind === "settings"
      ? setSettingsOpen("Sources")
      : setDrawer((current) =>
          current === kind && !rightPinned ? null : kind,
        );
  const selectPin = (pin) => {
    showLocation({ ...pin, title: pin.label });
    if (drawer === "pins") setLibraryTab("pins");
    setActivePinId(pin.id);
  };
  const focusPin = (pin) => {
    setMapLocation(withTimezone({ ...pin, title: pin.label, zoom: 14 }));
    setPage("atlas");
    setActivePinId(pin.id);
  };
  const [profilePhoto, setProfilePhoto] = useState(null);
  useEffect(() => {
    let live = true;
    setProfilePhoto(null);
    if (user)
      api("/account")
        .then((account) => {
          if (live) setProfilePhoto({ owner: user.id, avatar: account.avatar });
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [user?.id]);
  const savingPin = useRef(false);
  const createPin = async (data, { select = true } = {}) => {
    if (savingPin.current) return;
    savingPin.current = true;
    try {
      // Read current records, rather than a render snapshot, before each save.
      const existing = (await api("/pins")).find(
        (pin) =>
          Math.abs(pin.lat - data.lat) <= 0.00001 &&
          Math.abs(pin.lng - data.lng) <= 0.00001,
      );
      if (
        existing &&
        !(await confirmAction(
          `“${existing.label}” is already saved at this location. Create a duplicate?`,
        ))
      )
        return;
      const where = withTimezone(data);
      const pin = await pinStore.create({
        label:
          data.label || data.title || "Location " + where.grid.toUpperCase(),
        callsign: data.callsign || "",
        notes: data.notes || "",
        lat: data.lat,
        lng: data.lng,
      });
      if (select) selectPin(pin);
      else setActivePinId(pin.id);
      toast(
        `Saved location “${pin.label}” to your device at ${pin.lat.toFixed(5)}°, ${pin.lng.toFixed(5)}°.`,
      );
      setEditingPinId(pin.id);
      setLibraryTab("pins");
      setDrawer("pins");
      return pin;
    } finally {
      savingPin.current = false;
    }
  };
  const movePin = async (id, point) => {
    try {
      const pin = await pinStore.update(id, point);
      setMovingPinId(null);
      setActivePinId(pin.id);
      toast(
        `Moved saved location “${pin.label}” to ${pin.lat.toFixed(5)}°, ${pin.lng.toFixed(5)}°.`,
      );
      return pin;
    } catch (error) {
      setNotice(error.message);
      throw error;
    }
  };
  const beginMove = (pin) => {
    setMovingPinId(pin.id);
    if (!rightPinned) setDrawer(null);
    if (!["dashboard", "atlas"].includes(page)) focusPin(pin);
  };
  const deletePin = async (pin) => {
    if (!(await confirmAction("Delete saved location “" + pin.label + "”?")))
      return;
    try {
      await pinStore.remove(pin.id);
      toast(`Deleted saved location “${pin.label}” from this device.`);
      if (activePinId === pin.id) setActivePinId(null);
      if (editingPinId === pin.id) setEditingPinId(null);
      if (movingPinId === pin.id) setMovingPinId(null);
    } catch (error) {
      setNotice(error.message);
    }
  };
  const selectRepeaters = (ids) => {
    setRepeaterIds(ids);
    setActiveRepeaterId(ids[0]);
    setDrawer("repeater");
  };
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape" && !e.defaultPrevented) setMovingPinId(null);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  const online = networkOnline && !forcedOffline;
  const kp = useFeed("kp"),
    solar = useFeed("solar"),
    iss = useFeed("iss", 30000);
  useEffect(() => {
    if (isNative)
      connection()
        .then((c) => setForcedOffline(!!c.offline))
        .catch(() => {});
    api("/me")
      .then(setUser)
      .catch(() =>
        setNotice(
          isNative
            ? "Unable to open your local station profile. Your database has not been deleted."
            : "Development API unavailable. Public dashboard is still accessible.",
        ),
      );
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  return (
    <div
      style={panelWidths.style}
      className={
        "app " +
        (["dashboard", "atlas"].includes(page) ? "map-page " : "") +
        (drawer ? "drawer-open " : "") +
        (leftOpen ? "left-open" : "")
      }
    >
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("dashboard");
          }}
        >
          <img className="brand-logo" src="./oar-logo-sq.png" alt="OAR" />
          <strong>
            OAR<span>OPEN AMATEUR RADIO</span>
          </strong>
        </a>
        <div className="nav-label">STATION WORKSPACE</div>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-label={label}
              title={label}
              className={page === id ? "selected" : ""}
              onClick={() => setPage(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "messages" && <span className="nav-tag">CQ</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="station-card">
            <span className="eyebrow">YOUR STATION</span>
            <strong>{user?.callsign || "Hello, operator."}</strong>
            <small>
              {user
                ? (user.grid || "Location not set") + " · Callsign not verified"
                : "A world of connections awaits."}
            </small>
            {!user && (
              <button onClick={() => setAuth(true)}>
                Join the frequency <ArrowUpRight size={15} />
              </button>
            )}
          </div>
          <button
            className={"settings-button " + (settingsOpen ? "selected" : "")}
            onClick={() => toggleDrawer("settings")}
            aria-label="Settings"
            aria-haspopup="dialog"
            aria-expanded={!!settingsOpen}
          >
            <Settings size={18} />
            Station settings
          </button>
          <div className="version">
            <span className="dot" />
            OAR / v{APP_VERSION} <span>73, always.</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header
          className={
            "topbar platform-" + (window.oarDesktop?.platform || "browser")
          }
        >
          {window.oarDesktop?.platform === "darwin" && <WindowControls />}
          <button
            className="icon-button topbar-location-button"
            aria-label="Location details"
            aria-expanded={leftOpen}
            onClick={() => setLeftOpen((v) => (leftPinned ? true : !v))}
          >
            <PanelLeft size={17} />
          </button>
          <span className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <b>{nav.find((n) => n[0] === page)?.[1] || "Station settings"}</b>
          </span>
          <div className="topbar-search-group">
            <AddressSearch
              onClear={() => {
                setSearchLocation(null);
                setMapLocation(null);
              }}
              onSavedSelect={(place) => {
                if (place.savedKind === "contact") {
                  setActiveContactId({ id: place.savedId });
                  if (place.unlocated) {
                    setLibraryTab("contacts");
                    setDrawer("pins");
                    setNotice(place.subtitle);
                  }
                } else setActivePinId(place.savedId);
              }}
              onSelect={(place) => {
                setMapLocation(place);
                setSearchLocation(place);
                setPage("atlas");
              }}
            />
          </div>
          <div className="top-actions">
            <button
              className="icon-button"
              aria-label="Save application screenshot"
              title="Save application screenshot to Pictures (may include private data)"
              onClick={async () => {
                try {
                  if (!window.oarDesktop?.screenshot)
                    throw Error(
                      "Screenshot saving is available in the installed desktop application.",
                    );
                  const result = await window.oarDesktop.screenshot();
                  toast("Screenshot saved to " + result.path);
                } catch (e) {
                  toast(e.message);
                }
              }}
            >
              <Camera size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Saved locations"
              title="Saved locations"
              aria-controls="map-drawer"
              aria-expanded={drawer === "pins"}
              onClick={() => toggleDrawer("pins")}
            >
              <MapPinned size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Map settings"
              title="Settings"
              aria-controls="settings-dialog"
              aria-haspopup="dialog"
              aria-expanded={!!settingsOpen}
              onClick={() => toggleDrawer("settings")}
            >
              <Settings size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="About OAR"
              title="About OAR"
              onClick={() => setAboutOpen(true)}
            >
              <Info size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Quick Switch"
              title="Quick Switch"
              aria-expanded={quickOpen}
              aria-controls="quick-switch-panel"
              onClick={() => setQuickOpen((v) => !v)}
            >
              <SlidersHorizontal size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Start tutorial"
              title="Help · Start tutorial"
              onClick={startTutorial}
            >
              <CircleHelp size={18} />
            </button>
            <span className={"connection " + (!online ? "offline" : "")}>
              <i className="dot" />
              {forcedOffline
                ? "Offline mode"
                : online
                  ? "Network online"
                  : "Offline"}
            </span>
            <button
              className="profile-button"
              aria-haspopup="menu"
              aria-expanded={accountMenu}
              onClick={() => setAccountMenu((v) => !v)}
            >
              {user?.callsign || "Sign in"}
              <span>
                {user &&
                profilePhoto?.owner === user.id &&
                profilePhoto.avatar ? (
                  <img
                    src={`data:${profilePhoto.avatar.mime};base64,${profilePhoto.avatar.data}`}
                    alt="Your profile photo"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      borderRadius: "50%",
                    }}
                  />
                ) : user ? (
                  user.callsign.slice(0, 2)
                ) : (
                  "↗"
                )}
              </span>
            </button>
            {accountMenu && (
              <AccountMenu
                signedIn={!!user}
                onSignIn={() => setAuth(true)}
                onClose={() => setAccountMenu(false)}
                onUpdates={checkForUpdates}
                onTutorial={startTutorial}
                onEdit={() => setAccountScreen("profile")}
                onAbout={() => setAboutOpen(true)}
                onLogout={async () => {
                  try {
                    await post("/logout", {});
                    setUser(null);
                    setAccountScreen(null);
                  } catch (e) {
                    setNotice(e.message);
                  }
                }}
              />
            )}
          </div>
          {window.oarDesktop?.platform === "win32" && <WindowControls />}
        </header>
        <main data-tutorial="main">
          {!online && (
            <div className="notice">
              {isNative
                ? "Offline · your local station and logbook still work. Maps and fresh observations may be unavailable."
                : "Offline · browser development mode requires the local development service."}
            </div>
          )}
          {(page === "dashboard" || page === "atlas") && (
            <>
              <div className="section-title">
                <div>
                  <span className="eyebrow">
                    {page === "atlas"
                      ? "ONE PLANET. EVERY TIMEZONE."
                      : "THE WORLD IS ON YOUR FREQUENCY"}
                  </span>
                  <h1>
                    {page === "atlas" ? (
                      "A global perspective."
                    ) : (
                      <>
                        Good to have you on air<span className="accent">.</span>
                      </>
                    )}
                  </h1>
                  <p>
                    {user
                      ? `${user.callsign}${user.grid ? " / " + user.grid : ""} — `
                      : ""}
                    Your station. Your signals. Everything connected.
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => (user ? setPage("logbook") : setAuth(true))}
                >
                  <Plus size={16} /> Log a contact
                </button>
              </div>
              <WorldTime
                config={timeSettings.value}
                pins={pinStore.pins}
                onSave={timeSettings.save}
                ready={timeSettings.ready}
                editing={clockEdit}
                setEditing={setClockEdit}
                offset={clockOffset}
                setOffset={setClockOffset}
                followGrey={followGrey}
              />
              <Atlas
                user={user}
                full={page === "atlas"}
                iss={iss}
                zones={showZones}
                focusLocation={mapLocation}
                searchLocation={searchLocation}
                onLocationSelect={showLocation}
                theme={theme}
                grey={grey}
                greyOffset={followGrey ? clockOffset : 0}
                muf={muf}
                radar={radar}
                cities={showCities}
                streets={showStreets}
                pins={pinStore.pins}
                repeaters={
                  showRepeaters
                    ? directory.value?.repeaters || NO_REPEATERS
                    : NO_REPEATERS
                }
                selectedRepeaterId={activeRepeaterId}
                movingPinId={movingPinId}
                onPinMove={movePin}
                onPinSelect={selectPin}
                onRepeaterSelect={selectRepeaters}
                onContext={setMapContext}
                onPinHover={setHoveredPin}
                onContextClose={closeContext}
                onCancelMove={() => setMovingPinId(null)}
                homeReady={timeSettings.ready}
                onHome={() => {
                  const home = timeSettings.value.home;
                  if (Number.isFinite(home.lat) && Number.isFinite(home.lng)) {
                    setMovingPinId(null);
                    setMapLocation(
                      withTimezone({
                        ...home,
                        title: home.name,
                        kind: "home",
                        locationSource: "Configured home location",
                        zoom: 12,
                      }),
                    );
                  } else setClockEdit("home");
                }}
              />
              {page === "dashboard" && (
                <>
                  <div className="section-title compact">
                    <h3>Space & signal</h3>
                    <span className="muted">
                      Latest available observations <span className="dot" />
                    </span>
                  </div>
                  <SpaceStats kp={kp} solar={solar} iss={iss} />
                  <div className="bottom-grid">
                    <button
                      className="panel dashboard-link"
                      onClick={() => setPage("conditions")}
                    >
                      <div className="round-icon">
                        <CloudSun />
                      </div>
                      <div>
                        <h3>Read the atmosphere</h3>
                        <p>Radar, solar imagery & propagation tools</p>
                      </div>
                      <ArrowUpRight />
                    </button>
                    <button
                      className="panel dashboard-link"
                      onClick={() => setPage("messages")}
                    >
                      <div className="round-icon">
                        <MessageSquare />
                      </div>
                      <div>
                        <h3>A callsign. A connection.</h3>
                        <p>Find operators and keep the conversation going</p>
                      </div>
                      <ArrowUpRight />
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          {page === "conditions" && <Conditions />}
          {["messages", "logbook"].includes(page) &&
            (!user ? (
              <div className="panel welcome">
                <Radio size={48} />
                <span className="eyebrow">YOUR CALLSIGN IS YOUR IDENTITY</span>
                <h2>Make yourself heard.</h2>
                <p>
                  {isNative
                    ? "Create a local station profile to save your details and logbook on this device. No internet or server setup is required."
                    : "Create your station profile to exchange messages and save your logbook."}
                </p>
                <button className="primary" onClick={() => setAuth(true)}>
                  Sign in or register <ArrowUpRight size={16} />
                </button>
                <small>
                  Callsigns are self-declared, not proof of a radio licence.
                </small>
              </div>
            ) : page === "messages" ? (
              isNative ? (
                <RelayPanel user={user} />
              ) : (
                <Messages user={user} />
              )
            ) : (
              <Logbook />
            ))}
          <footer className="footer">
            <span>
              OAR <span> / </span> OPEN AMATEUR RADIO
            </span>
            <span>Built for the bands. Open to the world.</span>
          </footer>
        </main>
      </div>
      <LocationDetails
        onFocus={(place) => {
          if (Number.isFinite(place?.lat) && Number.isFinite(place?.lng)) {
            setPage("atlas");
            setMapLocation({
              ...withTimezone({ ...place, zoom: 12 }),
              focusOnly: true,
            });
          } else {
            setPage("atlas");
            setClockEdit("home");
          }
        }}
        onHome={async (place) => {
          try {
            if (!timeSettings.ready)
              throw Error("Clock settings are still loading.");
            await timeSettings.save({
              ...timeSettings.value,
              home: {
                ...placeFromLocation({
                  ...place,
                  title: place.name || place.title || place.label,
                }),
                ...(timeSettings.value.home.color
                  ? { color: timeSettings.value.home.color }
                  : {}),
              },
            });
            setNotice(
              `Home location changed to “${place.name || place.title || place.label || "selected map point"}”. Your home clock, weather and map Home button now use this location.`,
            );
          } catch (e) {
            setNotice(e.message);
          }
        }}
        resize={panelWidths.left}
        open={leftOpen}
        pinned={leftPinned}
        setPinned={setLeftPinned}
        onClose={() => setLeftOpen(false)}
        home={timeSettings.value.home}
        selected={selectedLocations}
        onLock={(key) =>
          setSelectedLocations((items) => {
            const item = items.find((i) => i.key === key);
            if (!item?.locked && items.filter((i) => i.locked).length >= 20) {
              toast(
                "You can temporarily pin up to 20 selected locations. Unpin or close one first.",
              );
              return items;
            }
            return items.map((i) =>
              i.key === key ? { ...i, locked: !i.locked } : i,
            );
          })
        }
        hoveredPin={hoveredPin}
        onDismiss={(key) =>
          setSelectedLocations((items) => items.filter((i) => i.key !== key))
        }
        pins={pinStore.pins}
        onCorrect={(place, key) => {
          const location = withTimezone(place);
          setSelectedLocations((items) =>
            items.map((i) => (i.key === key ? { ...i, place: location } : i)),
          );
          setMapLocation(location);
          setSearchLocation(location);
        }}
        onSave={(p) =>
          createPin(p, { select: false }).catch((e) => setNotice(e.message))
        }
        onStation={
          user
            ? async (place) => {
                try {
                  const updated = await api("/me", {
                    method: "PATCH",
                    body: JSON.stringify({
                      name: user.name,
                      bio: user.bio,
                      grid: withTimezone(place).grid,
                    }),
                  });
                  setUser(updated);
                  setNotice("Station grid saved: " + updated.grid);
                } catch (e) {
                  setNotice(e.message);
                }
              }
            : null
        }
      />
      {quickOpen && (
        <QuickSwitch onClose={() => setQuickOpen(false)}>
          <MapToolbar
            grey={grey}
            setGrey={setGrey}
            muf={muf}
            setMuf={setMuf}
            followGrey={followGrey}
            radar={radar}
            setRadar={setRadar}
          />
          <MapSettings
            zones={showZones}
            setZones={setShowZones}
            streets={showStreets}
            setStreets={setShowStreets}
            cities={showCities}
            setCities={setShowCities}
            showRepeaters={showRepeaters}
            setRepeaters={setShowRepeaters}
            directory={directory}
          />
          <Switch
            fullRow
            label="Grey line follows clock slider"
            value={followGrey}
            onChange={setFollowGrey}
            description="Preview day/night shading at the clock comparison time; observations remain at their published times."
          />
        </QuickSwitch>
      )}
      {settingsOpen && (
        <SettingsDialog
          initialTab={settingsOpen}
          onClose={() => setSettingsOpen(null)}
          tabs={{
            Sources: <SourcesEditor />,
            Login: <LoginSettings />,
            Relay: <RelayPanel user={user} />,
            Appearance: appearanceSettings.ready ? (
              <AppearanceSettings
                value={appearanceSettings.value}
                onSave={appearanceSettings.save}
                onPreview={setPreviewFont}
              />
            ) : (
              <p>Loading appearance…</p>
            ),
            Themes: themeSettings.ready ? (
              <ThemeEditor
                value={themeSettings.value}
                onSave={themeSettings.save}
                onPreview={setPreviewTheme}
              />
            ) : (
              <p>Loading themes…</p>
            ),
            Data: (
              <>
                {isNative && <LocalData />}
                <LibraryTransfer
                  onImported={async () => {
                    await pinStore.reload();
                    setLibraryRevision((n) => n + 1);
                  }}
                />
              </>
            ),
            Account: user ? (
              <Profile
                onEdit={() => {
                  setSettingsOpen(null);
                  setAccountScreen("profile");
                }}
                user={user}
                setUser={setUser}
                onLogout={async () => {
                  try {
                    await post("/logout", {});
                    setUser(null);
                  } catch (e) {
                    setNotice(e.message);
                  }
                }}
              />
            ) : (
              <div className="panel welcome">
                <h3>Local station profile</h3>
                <p>Sign in or create a profile on this device.</p>
                <button
                  onClick={() => {
                    setSettingsOpen(null);
                    setAuth(true);
                  }}
                >
                  Sign in or register
                </button>
              </div>
            ),
          }}
        />
      )}
      <MapDrawer
        resize={panelWidths.right}
        kind={drawer}
        pinned={rightPinned}
        setPinned={setRightPinned}
        onClose={() => !rightPinned && setDrawer(null)}
      >
        {drawer === "pins" ? (
          <>
            <LibraryTransfer
              onImported={async () => {
                await pinStore.reload();
                setLibraryRevision((n) => n + 1);
              }}
            >
              <button
                className="icon-button"
                title="Locations"
                aria-label="Locations"
                aria-pressed={libraryTab === "pins"}
                onClick={() => setLibraryTab("pins")}
              >
                <MapPin size={16} />
              </button>
              <button
                className="icon-button"
                title="Contacts"
                aria-label="Contacts"
                aria-pressed={libraryTab === "contacts"}
                onClick={() => setLibraryTab("contacts")}
              >
                <BookOpen size={16} />
              </button>
            </LibraryTransfer>
            {libraryTab === "contacts" ? (
              <LibraryContacts
                hoveredPin={hoveredPin}
                revision={libraryRevision}
                home={timeSettings.value.home}
                pins={pinStore.pins}
                activeId={activeContactId?.id}
                focusRequest={activeContactId}
                onFocus={(contact) => {
                  setActiveContactId({ id: contact.id });
                  const place = contactLocation(contact, pinStore.pins);
                  setMapLocation(place);
                  setPage("atlas");
                  setNotice(place.locationSource);
                }}
              />
            ) : (
              <SavedPins
                hoveredPin={hoveredPin}
                home={timeSettings.value.home}
                editingPinId={editingPinId}
                onEditHandled={() => setEditingPinId(null)}
                pins={pinStore.pins}
                error={pinStore.error}
                activeId={activePinId}
                onUpdate={async (id, patch) => {
                  const pin = await pinStore.update(id, patch);
                  if (pin.id !== id) setActivePinId(pin.id);
                  return pin;
                }}
                onFocus={focusPin}
                onDelete={deletePin}
                onMove={beginMove}
                onHome={async (pin) => {
                  await timeSettings.save({
                    ...timeSettings.value,
                    home: {
                      ...placeFromLocation({ ...pin, title: pin.label }),
                      ...(timeSettings.value.home.color
                        ? { color: timeSettings.value.home.color }
                        : {}),
                    },
                  });
                  setLeftOpen(true);
                  setNotice(
                    `Home location changed to saved pin “${pin.label}”. Your home clock, weather and map Home button now use its coordinates.`,
                  );
                }}
              />
            )}
          </>
        ) : drawer === "link" ? (
          <LinkPlanner
            source={linkSource}
            destination={linkDestination}
            onClear={() => {
              setLinkSource(null);
              setLinkDestination(null);
            }}
          />
        ) : (
          <RepeaterDetails
            repeater={selectedRepeater}
            alternatives={matches}
            onChoose={setActiveRepeaterId}
            directory={directory.value}
            onSave={createPin}
          />
        )}
      </MapDrawer>
      {mapContext && (
        <MapContextMenu
          key={
            (mapContext.pin?.id || "map") +
            "-" +
            mapContext.x +
            "-" +
            mapContext.y
          }
          context={mapContext}
          onAddClock={async (place) => {
            if (!timeSettings.ready)
              throw Error("Clock settings are still loading.");
            if (timeSettings.value.clocks.length >= 24)
              throw Error(
                "The toolbar supports up to 24 additional clocks. Remove a clock first.",
              );
            await timeSettings.save({
              ...timeSettings.value,
              clocks: [
                ...timeSettings.value.clocks,
                { id: crypto.randomUUID(), ...placeFromLocation(place) },
              ],
            });
            setNotice(
              "Location added to the clock toolbar. Double-click its clock to rename or customize it.",
            );
          }}
          source={linkSource}
          onSource={(point) => {
            setLinkSource(point);
            setLinkDestination(null);
            setDrawer("link");
          }}
          onDestination={(point) => {
            setLinkDestination(point);
            setDrawer("link");
          }}
          onClose={closeContext}
          onSave={createPin}
          onEdit={(pin) => {
            selectPin(pin);
            setEditingPinId(pin.id);
            setLibraryTab("pins");
            setDrawer("pins");
          }}
          onMove={beginMove}
          onDelete={deletePin}
          onFocus={focusPin}
        />
      )}
      <div
        className="app-statusbar map-footer"
        aria-label="Application version and station status"
      >
        <span>OAR v{APP_VERSION}</span>
        <span>
          <i className="station-dot" />{" "}
          {user
            ? user.callsign +
              (user.grid ? " · " + user.grid : " · location not set")
            : "Set up your station"}
        </span>
      </div>
      <SourceHost home={timeSettings.value.home} />
      <UpdateNotice />
      <ToastHost />
      <ConfirmationHost />
      {tutorialOpen && (
        <Tutorial onPrepare={prepareTutorial} onEnd={endTutorial} />
      )}
      {aboutOpen && (
        <AboutOAR offline={!online} onClose={() => setAboutOpen(false)} />
      )}
      {user && accountScreen && (
        <AccountPanel
          key={user.id}
          initial={accountScreen}
          home={timeSettings.value.home}
          user={user}
          onUser={setUser}
          onAvatar={(avatar) => setProfilePhoto({ owner: user.id, avatar })}
          onClose={() => setAccountScreen(null)}
          onLogout={async () => {
            await post("/logout", {});
            setUser(null);
          }}
        />
      )}
      {auth && (
        <Auth
          onClose={() => setAuth(false)}
          onUser={(u) => {
            setUser(u);
            setAuth(false);
          }}
        />
      )}
    </div>
  );
}
