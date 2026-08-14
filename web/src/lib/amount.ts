/**
 * Scale an amount with the serving count.
 *
 * Amounts are free text ("2 pound", "1 packet", "a pinch"), so only a leading
 * number is scaled and everything else is left alone. Text with no number is
 * returned untouched rather than guessed at — doubling "a pinch" means nothing,
 * and inventing "2 pinch" is worse than leaving it be.
 */
export function scaleAmount(description: string, factor: number): string {
  if (factor === 1) return description;
  return description.replace(/^(\d+(?:[.,]\d+)?)/, (match) => {
    const scaled = parseFloat(match.replace(",", ".")) * factor;
    // Two decimals, then trailing zeros dropped: 1.5 stays 1.5, 0.3333 becomes
    // 0.33, and 2.00 becomes 2 rather than reading like false precision.
    return String(Math.round(scaled * 100) / 100);
  });
}

/** "90" -> "1 h 30", "45" -> "45 min". Minutes are what the API stores. */
export function formatTime(minutes: number): string | null {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest}` : `${hours} h`;
}
