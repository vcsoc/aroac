import { useEffect } from "react";
export const CITY_LAYERS = [
  "cities-world",
  "cities-regional",
  "cities-local",
  "cities-neighbourhood",
];
export function useCityLabels(mapRef, ready, enabled, host) {
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    host.current.dataset.cityNames = String(enabled);
    if (!enabled) return;
    map.addSource("city-names", {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
      attribution: "© OpenStreetMap contributors · OpenFreeMap",
    });
    const tiers = [
      { min: 0, max: 5, rank: 3, classes: ["city"] },
      { min: 5, max: 8, rank: 12, classes: ["city", "town"] },
      { min: 8, max: 11, rank: 40, classes: ["city", "town", "village"] },
      {
        min: 11,
        max: 24,
        rank: 10000,
        classes: [
          "city",
          "town",
          "village",
          "hamlet",
          "suburb",
          "neighbourhood",
          "quarter",
        ],
      },
    ];
    tiers.forEach((tier, i) =>
      map.addLayer({
        id: CITY_LAYERS[i],
        type: "symbol",
        source: "city-names",
        "source-layer": "place",
        minzoom: tier.min,
        maxzoom: tier.max,
        filter: [
          "all",
          ["in", ["get", "class"], ["literal", tier.classes]],
          ["<=", ["coalesce", ["get", "rank"], 99], tier.rank],
        ],
        layout: {
          "text-field": [
            "coalesce",
            ["get", "name:en"],
            ["get", "name:latin"],
            ["get", "name"],
          ],
          "text-font": ["Noto Sans Regular"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            13,
            8,
            15,
            14,
            18,
          ],
          "text-padding": i === 0 ? 18 : 8,
          "text-max-width": 10,
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          "symbol-sort-key": ["coalesce", ["get", "rank"], 99],
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#071019",
          "text-halo-width": 2.5,
        },
      }),
    );
    return () => {
      if (mapRef.current !== map) return;
      for (const id of CITY_LAYERS) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource("city-names")) map.removeSource("city-names");
    };
  }, [ready, enabled]);
}
