import { useEffect, useState } from "react";
export function useSourceRevision() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const change = () => setRevision((v) => v + 1);
    window.addEventListener("oar-sources-changed", change);
    return () => window.removeEventListener("oar-sources-changed", change);
  }, []);
  return revision;
}
