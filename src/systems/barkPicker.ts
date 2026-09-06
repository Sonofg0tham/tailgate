/**
 * Picks a bark line from a list without repeating the one that was just said.
 * Pure, so the copy rotation can be unit tested: `random` is injected and
 * returns 0 to 1 like Math.random.
 */
export function pickBark(
  lines: readonly string[],
  lastLine: string | null,
  random: () => number = Math.random
): string | null {
  if (lines.length === 0) {
    return null;
  }
  if (lines.length === 1) {
    return lines[0];
  }
  const candidates = lastLine === null ? lines : lines.filter((line) => line !== lastLine);
  const pool = candidates.length > 0 ? candidates : lines;
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[index];
}
