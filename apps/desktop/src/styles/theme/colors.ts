export const brandColors = {
  primary: "#5fa392",
  primaryDark: "#8fd4c2",
  accent: "#c7f4e8",
  background: "#0d1413",
  surface: "#121c1a",
  textPrimary: "#e9fff9"
} as const;

export const themeColorVariables = {
  "--color-primary": brandColors.primary,
  "--color-primary-dark": brandColors.primaryDark,
  "--color-accent": brandColors.accent,
  "--color-background": brandColors.background,
  "--color-surface": brandColors.surface,
  "--color-text-primary": brandColors.textPrimary
} as const;
