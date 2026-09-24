import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchRoadmap, ROADMAP_URL } from "../shared/roadmap";

export default function Roadmap({ offline }) {
  const [state, setState] = useState({ loading: true });
  const [revision, retry] = useState(0);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setState({ loading: true });
    const load = async () => {
      if (offline) throw Error("Offline");
      return window.oarDesktop
        ? window.oarDesktop.roadmap()
        : fetchRoadmap({ signal: controller.signal });
    };
    load()
      .then((text) => {
        if (live) setState({ text });
      })
      .catch(() => {
        if (live) setState({ unavailable: true });
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [offline, revision]);
  if (state.loading)
    return <p role="status">Loading the latest AROAC roadmap from GitHub…</p>;
  if (state.unavailable)
    return (
      <section className="roadmap-fallback">
        <h3>The roadmap is currently unavailable</h3>
        <p>
          {offline
            ? "AROAC is working offline."
            : "AROAC could not retrieve the roadmap from GitHub."}
        </p>
        <p>
          A wide range of new features and improvements is planned for AROAC.
          You are welcome to reach out to Chris Visser if you would like to
          contribute or sponsor future development.
        </p>
        <p>
          <a
            href="https://github.com/vcsoc/aroac"
            target="_blank"
            rel="noreferrer"
          >
            Contact the developer on GitHub
          </a>
        </p>
        <button onClick={() => retry((v) => v + 1)} disabled={offline}>
          Try again
        </button>
      </section>
    );
  return (
    <section className="roadmap-content">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => (/^https:\/\//i.test(url) ? url : "")}
        components={{
          img: () => null,
          a: ({ children, href }) =>
            href ? (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
        }}
      >
        {state.text}
      </Markdown>
      <p>
        <a href={ROADMAP_URL} target="_blank" rel="noreferrer">
          View roadmap source on GitHub
        </a>
      </p>
    </section>
  );
}
