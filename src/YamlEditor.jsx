import { useLayoutEffect, useRef, useState } from "react";

export default function YamlEditor({ value, onChange, disabled }) {
  const input = useRef(),
    mirror = useRef(),
    numbers = useRef(),
    timer = useRef();
  const [heights, setHeights] = useState([]);
  const lines = value.split("\n");
  const sync = () => {
    if (numbers.current)
      numbers.current.style.transform = `translateY(-${input.current.scrollTop}px)`;
  };
  useLayoutEffect(() => {
    const node = input.current;
    const measure = () => {
      const style = getComputedStyle(node);
      mirror.current.style.width =
        node.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) +
        "px";
      setHeights(
        Array.from(
          mirror.current.children,
          (line) => line.getBoundingClientRect().height,
        ),
      );
      sync();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);
  useLayoutEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="yaml-editor" dir="ltr">
      <div className="yaml-gutter" aria-hidden="true">
        <div ref={numbers}>
          {lines.map((_, i) => (
            <div key={i} style={{ height: heights[i] }}>
              {i + 1}
            </div>
          ))}
        </div>
      </div>
      <textarea
        ref={input}
        aria-label="Sources YAML"
        className="themed-scroll"
        wrap="soft"
        spellCheck={false}
        disabled={disabled}
        value={value}
        onChange={onChange}
        onScroll={() => {
          sync();
          input.current.classList.add("scrolling");
          clearTimeout(timer.current);
          timer.current = setTimeout(
            () => input.current?.classList.remove("scrolling"),
            800,
          );
        }}
      />
      <div className="yaml-mirror" ref={mirror} aria-hidden="true">
        {lines.map((line, i) => (
          <div key={i}>{line || "\u200b"}</div>
        ))}
      </div>
    </div>
  );
}
