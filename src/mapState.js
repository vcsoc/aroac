import { useCallback, useEffect, useRef, useState } from "react";
import { api, post } from "./lib";
import { useSourceRevision } from "./sourceEvents";
export const NO_REPEATERS = [];
export function usePreference(key, fallback = false) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? fallback : saved === "true";
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    const sync = () => {
      try {
        const saved = localStorage.getItem(key);
        setValue(saved === null ? fallback : saved === "true");
      } catch {}
    };
    window.addEventListener("oar-preferences", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("oar-preferences", sync);
      window.removeEventListener("storage", sync);
    };
  }, [key, fallback]);
  const set = (next) => {
    setValue(next);
    try {
      localStorage.setItem(key, String(next));
      window.dispatchEvent(new Event("oar-preferences"));
    } catch {}
  };
  return [value, set];
}
export function usePins() {
  const [pins, setPins] = useState([]),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api("/pins")
      .then((rows) => {
        if (alive) setPins(rows);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  const create = async (data) => {
    const pin = await post("/pins", data);
    setPins((rows) => [pin, ...rows]);
    return pin;
  };
  const update = async (id, changes) => {
    const pin = await api("/pins/" + id, {
      method: "PATCH",
      body: JSON.stringify(changes),
    });
    setPins((rows) => rows.map((row) => (row.id === id ? pin : row)));
    return pin;
  };
  const remove = async (id) => {
    await api("/pins/" + id, { method: "DELETE" });
    setPins((rows) => rows.filter((row) => row.id !== id));
  };
  const reload = async () => {
    setPins(await api("/pins"));
    setError("");
  };
  return { pins, error, create, update, remove, reload };
}
export function useRepeaters(enabled) {
  const sourceRevision = useSourceRevision();
  const [value, setValue] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    generation = useRef(0);
  const load = useCallback(async (force = false) => {
    const token = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const data = await api("/repeaters" + (force ? "?refresh=1" : ""));
      if (token === generation.current) setValue(data);
    } catch (e) {
      if (token === generation.current) setError(e.message);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (enabled) load();
    else setLoading(false);
    return () => {
      generation.current++;
    };
  }, [enabled, load, sourceRevision]);
  return { value, error, loading, refresh: () => load(true) };
}
