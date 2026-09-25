import { useEffect, useState } from "react";
import { api } from "./lib";
export function useWorkspaceSetting(key, initial) {
  const [value, setValue] = useState(initial),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api("/preferences/" + key)
      .then((data) => {
        if (live && data.value) setValue(data.value);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [key]);
  const save = async (next) => {
    const result = await api("/preferences/" + key, {
      method: "PUT",
      body: JSON.stringify(next),
    });
    setValue(result.value);
    setError("");
    return result.value;
  };
  return { value, save, ready, error };
}
export async function documentFile(action, kind, content, suggestedName) {
  if (window.oarDesktop)
    return window.oarDesktop.documentFile(action, kind, content, suggestedName);
  if (action === "save") {
    const url = URL.createObjectURL(
        new Blob([content], {
          type: kind === "theme" ? "application/yaml" : "application/json",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download =
      kind === "theme"
        ? suggestedName || "aroac-theme.yaml"
        : "aroac-locations.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { path: a.download };
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = kind === "theme" ? ".yaml,.yml" : ".json";
    input.oncancel = () => resolve({ canceled: true });
    input.onchange = async () => {
      try {
        const file = input.files[0];
        if (!file) return resolve({ canceled: true });
        if (file.size > (kind === "theme" ? 256000 : 8000000))
          throw Error("File is too large.");
        resolve({ text: await file.text(), name: file.name });
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}
