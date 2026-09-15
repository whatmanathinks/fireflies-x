export const SERIES_COLORS = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
];

export const SENTIMENT_NEUTRAL = "#d8d6d0";
export const SENTIMENT_POSITIVE = "#2a78d6";
export const SENTIMENT_NEGATIVE = "#e34948";

export function seriesColor(index: number) {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}
