import { useEffect, useState } from "react";
import { toast } from "./Toasts";
import license from "../LICENSE?raw";
import fonts from "../public/fonts/report-sans-LICENSE.txt?raw";
import glyphs from "../public/fonts/OFL.txt?raw";
import jetbrains from "../public/fonts/JetBrainsMono-OFL.txt?raw";
export default function LicenseView() {
  const [dependencies, setDependencies] = useState([]),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetch("./dependency-licenses.json")
      .then((r) => {
        if (!r.ok) throw Error("Dependency notices unavailable.");
        return r.json();
      })
      .then((v) => {
        if (live) setDependencies(v);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="license-content">
      <h3>AROAC license</h3>
      <pre>{license}</pre>
      <details className="third-party-licenses">
        <summary>Third-party materials</summary>
        {window.oarDesktop?.runtimeLicenses && (
          <button
            onClick={() =>
              window.oarDesktop.runtimeLicenses().catch((e) => toast(e.message))
            }
          >
            Open bundled Chromium license notices
          </button>
        )}
        <p>
          Third-party rights remain under their respective licenses. Runtime
          dependency notices are listed below; inclusion does not imply that
          every dependency is active on every platform. Maps, observations and
          datasets retain the source attribution shown in AROAC.
        </p>
        <details>
          <summary>Noto Sans report font — SIL Open Font License</summary>
          <pre>{fonts}</pre>
        </details>
        <details>
          <summary>Noto Sans map glyphs — SIL Open Font License</summary>
          <pre>{glyphs}</pre>
        </details>
        <details>
          <summary>JetBrains Mono — SIL Open Font License</summary>
          <pre>{jetbrains}</pre>
        </details>
        <p>
          GeoNames: Creative Commons Attribution 4.0. Map and feed provider
          terms apply separately.
        </p>
        {error && <p role="status">{error}</p>}
        {dependencies.map((d) => (
          <details key={d.name}>
            <summary>
              {d.name} · {d.license}
            </summary>
            <pre>
              {d.text ||
                "License text was not included by this package; consult its upstream distribution."}
            </pre>
          </details>
        ))}
      </details>
    </section>
  );
}
