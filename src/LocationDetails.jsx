import { useEffect, useRef, useState } from "react";
import { SELECTED_SAVED_COLOR } from "./locationColors";
import { homeDifference } from "./contactContext";
import "./location-tabs.css";
import { Help } from "./InterfaceUI";
import { useSourceRevision } from "./sourceEvents";
import {
  Pin,
  PinOff,
  X,
  MapPin,
  Home,
  RefreshCw,
  Save,
  Radio,
} from "lucide-react";
import { api, maidenhead, timeAt } from "./lib";
import { usePreference } from "./mapState";
export function WeatherSwitch({
  label,
  checked,
  onChange,
  labels,
  hideLabel = false,
}) {
  return (
    <div className="weather-switch">
      {!hideLabel && <span>{label}</span>}
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        aria-description={`Off: ${labels[0]}. On: ${labels[1]}.`}
        onClick={() => onChange(!checked)}
      >
        <i aria-hidden="true" />
        <span>{labels[0]}</span>
        <span>{labels[1]}</span>
      </button>
    </div>
  );
}
import PlaceName from "./PlaceName";
import AddressCorrection from "./AddressCorrection";
import WeatherIcon from "./WeatherIcon";
import { PanelResizer, PanelScrollArea } from "./PanelLayout";
import { Disclosure, CollapseButton, useSavedState } from "./SavedItemUI";
export const codes = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm / hail",
  99: "Thunderstorm / hail",
};
const shown = (v, suffix = "", digits = 0) =>
  Number.isFinite(v) ? v.toFixed(digits) + suffix : "—";
const direction = (d) =>
  Number.isFinite(d)
    ? [
        "N",
        "NNE",
        "NE",
        "ENE",
        "E",
        "ESE",
        "SE",
        "SSE",
        "S",
        "SSW",
        "SW",
        "WSW",
        "W",
        "WNW",
        "NW",
        "NNW",
      ][Math.round(d / 22.5) % 16]
    : "";
export function useWeather(place, enabled = true) {
  const sourceRevision = useSourceRevision();
  const [state, setState] = useState({}),
    [revision, setRevision] = useState(0);
  const lat = place?.lat,
    lng = place?.lng;
  useEffect(() => setState({}), [lat, lng]);
  useEffect(() => {
    let live = true;
    if (!enabled || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const load = () =>
      api(`/weather?lat=${lat}&lng=${lng}`)
        .then((data) => {
          if (live) setState({ data });
        })
        .catch((e) => {
          if (live) setState({ error: e.message });
        });
    const timer = setTimeout(load, 200),
      interval = setInterval(load, 15 * 60_000);
    return () => {
      live = false;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [lat, lng, revision, enabled, sourceRevision]);
  return { ...state, retry: () => setRevision((n) => n + 1) };
}
function LocationCard({
  locked,
  color,
  savedSelected,
  onLock,
  homeZone,
  onFocus,
  onHome,
  onDismiss,
  hovered,
  place,
  home,
  units,
  days,
  onSave,
  onStation,
  pins = [],
  onCorrect,
}) {
  const [homeClosed, setHomeClosed] = useSavedState(
    "oar-home-collapsed",
    false,
  );
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [selectedClosed, setSelectedClosed] = useState(false);
  const [saving, setSaving] = useState(false);
  const closed = home ? homeClosed : selectedClosed;
  const toggle = () =>
    home ? setHomeClosed(!homeClosed) : setSelectedClosed(!selectedClosed);
  const clickTimer = useRef();
  useEffect(() => {
    setSelectedClosed(false);
    return () => clearTimeout(clickTimer.current);
  }, [place?.lat, place?.lng]);
  const { data, error, retry } = useWeather(place, !closed);
  const located = Number.isFinite(place?.lat) && Number.isFinite(place?.lng),
    zone = place?.zone || "UTC",
    current = data?.current,
    temp = (v) =>
      shown(
        Number.isFinite(v) ? (units === "F" ? (v * 9) / 5 + 32 : v) : null,
        "°" + units,
      ),
    clock = (t) => (t ? timeAt(new Date(t * 1000), zone).slice(0, 5) : "—");
  let hour = data?.hourly?.time?.findLastIndex((t) => t <= current?.time);
  const dew = hour >= 0 ? data.hourly.dew_point_2m?.[hour] : null,
    visibility = hour >= 0 ? data.hourly.visibility?.[hour] : null;
  const focus = () => onFocus?.(place, home ? "home" : "selected");
  return (
    <section
      className={"location-card " + (hovered ? "pin-hovered" : "")}
      onClick={(e) => {
        if (e.target.closest("button,input,select,textarea,a,summary,label"))
          return;
        clearTimeout(clickTimer.current);
        if (e.detail === 1) clickTimer.current = setTimeout(focus, 280);
      }}
      aria-label={home ? "Home location details" : "Selected location details"}
    >
      <header
        className={
          "location-title-row " +
          (color || savedSelected ? "linked-location-header" : "")
        }
        style={
          color || savedSelected
            ? {
                "--location-link-color": savedSelected
                  ? SELECTED_SAVED_COLOR
                  : color,
              }
            : undefined
        }
        onDoubleClick={(e) => {
          if (e.target.closest("button:not(.location-title)")) return;
          clearTimeout(clickTimer.current);
          toggle();
        }}
      >
        <div className="location-title-group">
          <div className="location-heading-actions">
            <CollapseButton
              label={home ? "home location" : "selected location"}
              collapsed={!!closed}
              onToggle={toggle}
            />
            <button
              className="location-title"
              title="Click to focus on map; double-click to expand or collapse"
              onClick={(e) => {
                clearTimeout(clickTimer.current);
                if (e.detail === 0) {
                  focus();
                  return;
                }
                if (e.detail === 1) clickTimer.current = setTimeout(focus, 280);
              }}
            >
              <h3>
                {home ? <Home size={14} /> : <MapPin size={14} />}{" "}
                {home ? "Home location" : "Selected location"}
              </h3>
            </button>
          </div>
          <div className="location-subtitle">
            <strong>{place?.name || place?.title || "Map location"}</strong>
            <Help label={home ? "About home location" : "About map location"}>
              {place?.locationSource && <>{place.locationSource}. </>}
              Timezone identifiers name a representative city, not necessarily
              this location. Live time uses current daylight-saving rules.
              {!located && (
                <>
                  {" "}
                  Home time follows {zone}, but home coordinates are not set.
                  Use the home clock editor to choose your home address, city or
                  exact saved pin. Its weather and forecasts will then appear
                  here.
                </>
              )}
            </Help>
          </div>
        </div>
        <button
          className="icon-button"
          aria-label="Set as home location"
          title={located ? "Set as home location" : "No coordinates available"}
          disabled={!located}
          onClick={() => onHome?.(place)}
        >
          <Home size={15} />
        </button>
        {!home && (
          <>
            <button
              className="icon-button"
              aria-label="Save selected location"
              title="Save selected location"
              disabled={!located || saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await onSave(place);
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Save size={15} />
            </button>
            <button
              className="icon-button"
              aria-label={
                locked ? "Unpin selected location" : "Pin selected location"
              }
              aria-pressed={!!locked}
              title={
                locked
                  ? "Unpin this temporary location"
                  : "Keep this location when selecting another point"
              }
              onClick={onLock}
            >
              {locked ? <PinOff size={15} /> : <Pin size={15} />}
            </button>
          </>
        )}
        {!home && onDismiss && (
          <button
            className="icon-button"
            aria-label="Close selected location"
            title="Close selected location"
            onClick={onDismiss}
          >
            <X size={15} />
          </button>
        )}
      </header>
      {!closed && (
        <>
          <Disclosure
            storageKey={home ? "oar-home-details-collapsed" : null}
            title="Home location details"
          >
            {located ? (
              <>
                <PlaceName
                  lat={place.lat}
                  lng={place.lng}
                  time={
                    <strong aria-label="Live location time">
                      {place?.zone
                        ? timeAt(now, zone)
                        : "Local time unavailable"}
                    </strong>
                  }
                />
                <div className="location-coordinates">
                  {place.lat.toFixed(5)}°, {place.lng.toFixed(5)}° ·{" "}
                  {maidenhead(place.lat, place.lng)}
                </div>
                <div
                  className="location-live-time"
                  aria-label="Location timezone"
                >
                  <small>
                    Timezone: <span>{place?.zone || "Unknown"}</span>
                  </small>
                  {!home && (
                    <small>
                      {place?.zone
                        ? homeDifference(zone, homeZone, now)
                        : "Home time difference unavailable"}
                    </small>
                  )}
                </div>
                {!home && onCorrect && (
                  <AddressCorrection
                    place={place}
                    pins={pins}
                    onCorrect={onCorrect}
                  />
                )}
              </>
            ) : null}
          </Disclosure>
          {located && (
            <>
              {error ? (
                <p role="status">
                  {error}{" "}
                  <button aria-label="Retry weather" onClick={retry}>
                    <RefreshCw size={12} />
                  </button>
                </p>
              ) : !data ? (
                <p role="status">Loading weather…</p>
              ) : (
                <>
                  <Disclosure
                    storageKey={home ? "oar-home-weather-collapsed" : null}
                    title="Home current weather"
                  >
                    <div className="current-weather">
                      <WeatherIcon code={current.weather_code} size={28} />
                      <strong>{temp(current.temperature_2m)}</strong>
                      <span>
                        {codes[current.weather_code] ||
                          "Conditions not reported"}
                      </span>
                    </div>
                    <dl className="weather-facts">
                      {[
                        ["Feels like", temp(current.apparent_temperature)],
                        ["Humidity", shown(current.relative_humidity_2m, "%")],
                        [
                          "Wind",
                          `${direction(current.wind_direction_10m)} ${shown(current.wind_speed_10m, " km/h")} / ${shown(Number.isFinite(current.wind_speed_10m) ? current.wind_speed_10m / 1.609344 : null, " mph")}`,
                        ],
                        [
                          "Gusts",
                          `${shown(current.wind_gusts_10m, " km/h")} / ${shown(Number.isFinite(current.wind_gusts_10m) ? current.wind_gusts_10m / 1.609344 : null, " mph")}`,
                        ],
                        ["Dew point", temp(dew)],
                        ["Pressure", shown(current.pressure_msl, " hPa", 1)],
                        ["Cloud", shown(current.cloud_cover, "%")],
                        [
                          "Visibility",
                          shown(
                            Number.isFinite(visibility)
                              ? visibility / 1000
                              : null,
                            " km",
                            1,
                          ),
                        ],
                        ["Sunrise", clock(data.daily.sunrise?.[0])],
                        ["Sunset", clock(data.daily.sunset?.[0])],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </Disclosure>
                  <Disclosure
                    storageKey={home ? "oar-home-forecast-collapsed" : null}
                    title="Home forecast"
                  >
                    <div className={"forecast-grid forecast-days-" + days}>
                      {data.daily.time.slice(0, days).map((t, i) => (
                        <div key={t} title={codes[data.daily.weather_code[i]]}>
                          <div className="forecast-heading">
                            <b>
                              {new Intl.DateTimeFormat("en", {
                                timeZone: zone,
                                weekday: "short",
                                day: "numeric",
                              }).format(new Date(t * 1000))}
                            </b>
                            <WeatherIcon code={data.daily.weather_code[i]} />
                          </div>
                          <span>
                            {codes[data.daily.weather_code[i]] || "—"}
                          </span>
                          <strong>
                            {temp(data.daily.temperature_2m_max[i])} /{" "}
                            {temp(data.daily.temperature_2m_min[i])}
                          </strong>
                          <span>
                            Rain{" "}
                            {shown(
                              data.daily.precipitation_probability_max?.[i],
                              "%",
                            )}
                          </span>
                          <small>
                            Wind{" "}
                            {shown(data.daily.wind_speed_10m_max?.[i], " km/h")}
                          </small>
                        </div>
                      ))}
                    </div>
                  </Disclosure>
                  <small className="weather-credit">
                    {data.stale ? "Saved weather — may be outdated · " : ""}
                    <a
                      href={data.sourceUrl || "https://open-meteo.com/"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {data.source || "Open-Meteo (CC BY 4.0)"}
                    </a>{" "}
                    model estimates ·{" "}
                    {new Intl.DateTimeFormat("en", {
                      timeZone: zone,
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(current.time * 1000))}
                    . Forecasts, not guaranteed observations.
                  </small>
                </>
              )}
              {onStation && (
                <button
                  className="icon-button"
                  title="Use approximate location for my station"
                  aria-label="Use approximate location for my station"
                  onClick={() => onStation(place)}
                >
                  <Radio size={16} />
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
export default function LocationDetails({
  tab,
  setTab,
  rangeContent,
  onFocus,
  onHome,
  onDismiss,
  hoveredPin,
  resize,
  open,
  pinned,
  setPinned,
  onClose,
  home,
  selected = [],
  activePinId,
  onLock,
  onSave,
  onStation,
  pins = [],
  onCorrect,
}) {
  const tabs = ["General", "Range"];
  const [fahrenheit, setFahrenheit] = usePreference("oar-fahrenheit"),
    [week, setWeek] = usePreference("oar-week-forecast");
  useEffect(() => {
    if (!open || pinned) return;
    const key = (e) => {
      if (
        e.key === "Escape" &&
        !e.defaultPrevented &&
        !document.querySelector("dialog[open],[popover]:popover-open")
      )
        onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open, pinned, onClose]);
  return (
    <aside
      data-tutorial="location-panel"
      className={"location-pane " + (open ? "open" : "")}
      aria-label="Location details"
      aria-hidden={!open}
      inert={!open}
    >
      <div className="drawer-heading location-tab-heading">
        <div className="location-tabs" role="tablist" aria-label="Left panel">
          {tabs.map((name, index) => (
            <button
              key={name}
              type="button"
              role="tab"
              id={`location-tab-${name.toLowerCase()}`}
              aria-controls={`location-panel-${name.toLowerCase()}`}
              aria-selected={tab === name}
              tabIndex={tab === name ? 0 : -1}
              onClick={() => setTab(name)}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % tabs.length
                    : event.key === "ArrowLeft"
                      ? (index + tabs.length - 1) % tabs.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                setTab(tabs[next]);
                event.currentTarget.parentElement.children[next].focus();
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <button
          className="icon-button"
          aria-label="Pin left panel"
          aria-pressed={pinned}
          onClick={() => setPinned(!pinned)}
        >
          {pinned ? <PinOff size={16} /> : <Pin size={16} />}
        </button>
        <button
          className="icon-button"
          aria-label="Close location details"
          disabled={pinned}
          title={pinned ? "Unpin to close" : "Close"}
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      <PanelScrollArea>
        <div
          role="tabpanel"
          id="location-panel-general"
          aria-labelledby="location-tab-general"
          hidden={tab !== "General"}
          tabIndex={0}
        >
          <h2 className="location-section-heading">Location details</h2>
          <div className="weather-controls">
            <WeatherSwitch
              label="Temperature units"
              checked={fahrenheit}
              onChange={setFahrenheit}
              labels={["°C", "°F"]}
            />
            <WeatherSwitch
              label="Forecast days"
              checked={week}
              onChange={setWeek}
              labels={["3 days", "7 days"]}
            />
          </div>
          {open && (
            <>
              <LocationCard
                home
                homeZone={home?.zone}
                onFocus={onFocus}
                onHome={onHome}
                place={home}
                hovered={
                  hoveredPin &&
                  hoveredPin.lat === home?.lat &&
                  hoveredPin.lng === home?.lng
                }
                units={fahrenheit ? "F" : "C"}
                days={week ? 7 : 3}
              />
              {selected.map((item) => (
                <LocationCard
                  key={item.key}
                  place={item.place}
                  locked={item.locked}
                  color={item.locked ? item.color : null}
                  savedSelected={
                    item.place.id === activePinId &&
                    pins.some((pin) => pin.id === activePinId)
                  }
                  onLock={() => onLock(item.key)}
                  homeZone={home?.zone}
                  onFocus={onFocus}
                  onHome={onHome}
                  onDismiss={() => onDismiss(item.key)}
                  hovered={
                    hoveredPin &&
                    Math.abs(hoveredPin.lat - item.place.lat) < 0.000001 &&
                    Math.abs(hoveredPin.lng - item.place.lng) < 0.000001
                  }
                  units={fahrenheit ? "F" : "C"}
                  days={week ? 7 : 3}
                  onSave={onSave}
                  onStation={onStation}
                  pins={pins}
                  onCorrect={(place) => onCorrect(place, item.key)}
                />
              ))}
            </>
          )}
        </div>
        <div
          role="tabpanel"
          id="location-panel-range"
          aria-labelledby="location-tab-range"
          hidden={tab !== "Range"}
          tabIndex={0}
        >
          {rangeContent}
        </div>
      </PanelScrollArea>
      {resize && <PanelResizer {...resize} />}
    </aside>
  );
}
