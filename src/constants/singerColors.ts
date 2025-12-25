// Singer avatar colors - vibrant palette optimized for dark theme
export const SINGER_COLORS = [
  "#EF4444", // Red
  "#F97316", // Orange
  "#EAB308", // Yellow
  "#22C55E", // Green
  "#14B8A6", // Teal
  "#06B6D4", // Cyan
  "#3B82F6", // Blue
  "#8B5CF6", // Violet
  "#EC4899", // Pink
  "#F43F5E", // Rose
  "#10B981", // Emerald
  "#6366F1", // Indigo
] as const;

export type SingerColor = (typeof SINGER_COLORS)[number];

// Get a random color from the palette
export function getRandomSingerColor(): SingerColor {
  return SINGER_COLORS[Math.floor(Math.random() * SINGER_COLORS.length)];
}

// Get next color in sequence (for auto-assignment)
export function getNextSingerColor(usedColors: string[]): SingerColor {
  const availableColors = SINGER_COLORS.filter((c) => !usedColors.includes(c));
  if (availableColors.length > 0) {
    return availableColors[0];
  }
  // If all colors used, start over
  return SINGER_COLORS[usedColors.length % SINGER_COLORS.length];
}
