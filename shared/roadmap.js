export const ROADMAP_URL =
  "https://raw.githubusercontent.com/vcsoc/oar/main/roadmap.md";
export const ROADMAP_LIMIT = 128 * 1024;
export async function fetchRoadmap({
  offline = false,
  fetcher = fetch,
  signal,
} = {}) {
  if (offline) throw Error("Roadmap is unavailable in offline mode.");
  const response = await fetcher(ROADMAP_URL, {
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
    headers: { Accept: "text/plain, text/markdown" },
  });
  if (!response.ok || !response.body)
    throw Error("Roadmap is currently unavailable.");
  if (/text\/html/i.test(response.headers.get("content-type") || ""))
    throw Error("Invalid roadmap response.");
  const reader = response.body.getReader();
  let size = 0,
    text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > ROADMAP_LIMIT) throw Error("Roadmap exceeds the size limit.");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    if (!text.trim()) throw Error("Roadmap is empty.");
    return text;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
