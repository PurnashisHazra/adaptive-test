function collapseWhitespace(text: string): string {
  return text.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
}

const EMBEDDED_NUMBER_PREFIX =
  /(?:Round|Section|Chapter|Figure|Table|Part|Step|Level|Grade|Week|Day|Year|Page|Pg|No|Question|Q|Problem|Exercise|Example|Match(?:-?up)?|Group|Team|Set)\s*$/i;

type ListCandidate = { index: number; num: number };

/** "Round 8.", "Figure 3." — not a list marker (label + this number). */
function isEmbeddedNumberMarker(before: string, num: number): boolean {
  const tail = before.slice(-32);
  if (EMBEDDED_NUMBER_PREFIX.test(tail)) return true;
  const labelThenThisNum = new RegExp(
    `(?:Round|Section|Chapter|Figure|Table|Part|Step|Match(?:-?up)?|Group|Team)\\s+${num}\\.\\s*$`,
    "i",
  );
  if (labelThenThisNum.test(tail)) return true;
  if (num > 30) return true;
  return false;
}

function findNumericCandidates(text: string): ListCandidate[] {
  const re = /(?:^|\s)(\d{1,2})\.\s+/g;
  const out: ListCandidate[] = [];
  for (const match of text.matchAll(re)) {
    const index = match.index! + (match[0].startsWith(" ") ? 1 : 0);
    const num = parseInt(match[1]!, 10);
    const before = text.slice(0, index);
    if (isEmbeddedNumberMarker(before, num)) continue;
    out.push({ index, num });
  }
  return out;
}

/** Keep only indices that form 1, 2, 3, … in document order. */
function pickSequentialNumberedStarts(candidates: ListCandidate[]): number[] {
  if (candidates.length === 0) return [];

  const sorted = [...candidates].sort((a, b) => a.index - b.index);
  let best: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const first = sorted[i]!;
    if (first.num !== 1) continue;

    const chain: number[] = [first.index];
    let expected = 2;

    for (let j = i + 1; j < sorted.length; j++) {
      const c = sorted[j]!;
      if (c.num === expected) {
        chain.push(c.index);
        expected++;
      }
    }

    if (chain.length > best.length) best = chain;
  }

  return best.length >= 2 ? best : [];
}

function splitAtIndices(text: string, starts: number[]): string[] {
  const parts: string[] = [];
  if (starts[0]! > 0) {
    const intro = text.slice(0, starts[0]).trim();
    if (intro) parts.push(intro);
  }
  for (let i = 0; i < starts.length; i++) {
    const slice = text.slice(starts[i], starts[i + 1] ?? text.length).trim();
    if (slice) parts.push(slice);
  }
  return parts;
}

/** Lines that already start with "1. ", "2. ", etc. */
function splitByExplicitLines(block: string): string[] | null {
  const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const numbered = lines.filter((l) => /^\d{1,2}\.\s/.test(l));
  if (numbered.length < 2) return null;

  const parts: string[] = [];
  let current = "";

  for (const line of lines) {
    if (/^\d{1,2}\.\s/.test(line)) {
      if (current.trim()) parts.push(current.trim());
      current = line;
    } else {
      current = current ? `${current} ${line}` : line;
    }
  }
  if (current.trim()) parts.push(current.trim());

  const nums = parts.map((p) => {
    const m = p.match(/^(\d{1,2})\./);
    return m ? parseInt(m[1]!, 10) : null;
  });
  const valid =
    nums.length >= 2 &&
    nums[0] === 1 &&
    nums.every((n, i) => n === i + 1);

  return valid ? parts : null;
}

function splitBlockOnListMarkers(block: string): string[] {
  const trimmed = block.trim();
  if (!trimmed) return [];

  const fromLines = splitByExplicitLines(trimmed);
  if (fromLines) return fromLines;

  const collapsed = collapseWhitespace(trimmed);
  const starts = pickSequentialNumberedStarts(findNumericCandidates(collapsed));
  if (starts.length === 0) return [collapsed];

  return splitAtIndices(collapsed, starts);
}

/** Blocks for full-width display; real numbered lists (1., 2., 3.) each on their own line. */
export function formatQuestionParagraphs(text: string): string[] {
  const t = text.trim();
  if (!t) return [];

  return t
    .split(/\n\n+/)
    .flatMap((block) => splitBlockOnListMarkers(block))
    .filter(Boolean);
}

export function isNumberedListLine(text: string): boolean {
  return /^\d{1,2}\.\s/.test(text.trim());
}

/** Split long stems into passage (left) and question prompt (right), CAT-style. */
export function splitPassageAndQuestion(text: string): { passage: string | null; questionStem: string } {
  const t = text.trim();
  if (!t) return { passage: null, questionStem: "" };

  const parts = t.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2 && parts[0].length >= 80) {
    const questionStem = parts[parts.length - 1]!;
    const passage = parts.slice(0, -1).join("\n\n");
    return { passage, questionStem };
  }

  return { passage: null, questionStem: t };
}

export function formatExamTimer(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}
