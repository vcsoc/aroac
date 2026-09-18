import { useEffect, useRef, useState } from "react";
import { Sun, Moon, RefreshCw } from "lucide-react";
import SunCalc from "suncalc";
import WeatherIcon from "./WeatherIcon";
import { useWeather, codes } from "./LocationDetails";
import { homeDifference, linkGeometry } from "./contactContext";
import { usePreference } from "./mapState";
import { Help } from "./InterfaceUI";
export default function ContactContext({ place, error, home }) {
  const host = useRef(),
    [visible, setVisible] = useState(false),
    [now, setNow] = useState(() => new Date());
  const [fahrenheit] = usePreference("oar-fahrenheit");
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [visible]);
  const weather = useWeather(place, visible),
    current = weather.data?.current;
  const day = place
      ? SunCalc.getPosition(now, place.lat, place.lng).altitude >= 0
      : null,
    Icon = day ? Sun : Moon;
  const link = place ? linkGeometry(home, place) : null;
  const temp = (v) =>
    Number.isFinite(v)
      ? Math.round(fahrenheit ? (v * 9) / 5 + 32 : v) +
        (fahrenheit ? "°F" : "°C")
      : "—";
  return (
    <div className="contact-context" ref={host}>
      {!place ? (
        <small>
          {error || "Location not available."} Time, weather and link planning
          require a location.
        </small>
      ) : (
        <>
          <small className="location-source">
            {place.locationSource || "Saved pin coordinates"} ·{" "}
            {place.lat.toFixed(3)}°, {place.lng.toFixed(3)}°
          </small>
          <div className="contact-time">
            <Icon
              size={17}
              aria-label={
                day
                  ? "Daylight (sun above horizon)"
                  : "Night (sun below horizon)"
              }
            />
            <time
              dateTime={now.toISOString()}
              title="Live local time; independent of the comparison slider"
            >
              {new Intl.DateTimeFormat("en-GB", {
                timeZone: place.zone,
                weekday: "short",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }).format(now)}
            </time>
          </div>
          <small>{place.zone}</small>
          <small>
            {homeDifference(place.zone, home?.zone, now)} · current DST offsets
          </small>
          {current ? (
            <>
              <div className="contact-weather">
                <WeatherIcon code={current.weather_code} />
                <strong>{temp(current.temperature_2m)}</strong>
                <span>
                  {codes[current.weather_code] || "Conditions not reported"}
                </span>
              </div>
              <small>
                Feels {temp(current.apparent_temperature)} · Humidity{" "}
                {current.relative_humidity_2m ?? "—"}% · Wind{" "}
                {current.wind_speed_10m ?? "—"} km/h · Gusts{" "}
                {current.wind_gusts_10m ?? "—"} km/h
              </small>
              <small>
                Pressure {current.pressure_msl ?? "—"} hPa · Cloud{" "}
                {current.cloud_cover ?? "—"}%
              </small>
              <small className="weather-credit">
                {weather.data.stale ? "Cached / stale · " : ""}
                {weather.data.source || "Open-Meteo model"}·{" "}
                {Number.isFinite(current.time) &&
                Math.abs(current.time) < 8.64e12
                  ? new Intl.DateTimeFormat("en-GB", {
                      timeZone: place.zone,
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(current.time * 1000))
                  : "Time unknown"}
              </small>
            </>
          ) : (
            <small role="status">
              {weather.error || "Loading weather…"}
              {weather.error && (
                <button
                  type="button"
                  className="icon-button"
                  title="Retry contact weather"
                  aria-label="Retry contact weather"
                  onClick={weather.retry}
                >
                  <RefreshCw size={13} />
                </button>
              )}
            </small>
          )}
          <details className="link-planning">
            <summary>Home → contact: link planning</summary>
            {link ? (
              <p>
                Short path: approximately{" "}
                {Math.round(link.distance).toLocaleString()} km.{" "}
                {link.bearing == null
                  ? "Bearing is not meaningful for coincident or antipodal locations."
                  : `Point a directional antenna initially at ${Math.round(link.bearing)}° true from home (if using short path).`}{" "}
                Grid centres are approximate; this is not a propagation
                prediction.
              </p>
            ) : (
              <p>
                Set exact home coordinates for distance and antenna-bearing
                guidance.
              </p>
            )}
            <strong>HF reference bands</strong>
            <ul>
              <li>40 m ≈ 7 MHz (7,000,000 Hz)</li>
              <li>20 m ≈ 14 MHz (14,000,000 Hz)</li>
              <li>15 m ≈ 21 MHz (21,000,000 Hz)</li>
              <li>10 m ≈ 28 MHz (28,000,000 Hz)</li>
            </ul>
            <Help label="About HF reference bands">
              These are band references, not dial settings. No path-specific
              band/mode/power prediction is installed. Weather and MUF(3000 km)
              alone cannot establish this link. Agree a clear frequency and
              mode, check both operators’ licence privileges and local band
              plans, antennas and propagation before transmitting.
            </Help>
          </details>
        </>
      )}
    </div>
  );
}
