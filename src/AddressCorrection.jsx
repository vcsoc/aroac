import { useState } from "react";
import { api, post } from "./lib";
import { Help } from "./InterfaceUI";
import { toast } from "./Toasts";
export default function AddressCorrection({ place, pins, onCorrect }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const run = async (fn) => {
    setError("");
    setBusy(true);
    try {
      await fn();
      toast(
        `Updated the map position used for “${place.searchQuery}” on this device. The online provider’s data has not been changed.`,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!place.searchQuery) return null;
  return (
    <section className="address-correction">
      <Help label="About address corrections">
        {place.corrected
          ? "Position corrected on this device using your saved pin."
          : "Search-provider coordinates may be approximate. If a saved pin marks the correct position, use it below."}
      </Help>
      {!!pins.length && (
        <details>
          <summary>Correct this address using a saved pin</summary>
          {pins.map((pin) => (
            <button
              type="button"
              disabled={busy}
              key={pin.id}
              onClick={() =>
                run(async () =>
                  onCorrect(
                    await post("/geocode/correction", {
                      query: place.searchQuery,
                      resultId: place.id,
                      pinId: pin.id,
                    }),
                  ),
                )
              }
            >
              Use {pin.label} for this address
            </button>
          ))}
        </details>
      )}
      {place.corrected && (
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              await api(
                "/geocode/correction?q=" +
                  encodeURIComponent(place.searchQuery),
                { method: "DELETE" },
              );
              const data = await api(
                "/geocode?q=" + encodeURIComponent(place.searchQuery),
              );
              const original =
                data.results.find((r) => r.id === place.id) || data.results[0];
              if (original)
                onCorrect({ ...original, searchQuery: place.searchQuery });
            })
          }
        >
          Restore provider position
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
