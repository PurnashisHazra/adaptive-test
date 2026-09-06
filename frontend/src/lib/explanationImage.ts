const MARKER_RE = /<!--adaptest-exp-img:([\s\S]*?)-->/g;

export function splitExplanationImage(
  explanation?: string | null,
  explicitUrl?: string | null,
): { text: string; url: string } {
  let found = "";
  const cleaned = (explanation || "")
    .replace(MARKER_RE, (_, raw: string) => {
      const s = String(raw || "").trim();
      if (s) found = s;
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: cleaned, url: (explicitUrl || "").trim() || found };
}

export function embedExplanationImage(explanation: string, imageUrl: string): string | null {
  const { text } = splitExplanationImage(explanation);
  const url = imageUrl.trim();
  if (!url) return text || null;
  const marker = `<!--adaptest-exp-img:${url}-->`;
  return text ? `${text}\n\n${marker}` : marker;
}
