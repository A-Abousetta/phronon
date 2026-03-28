export const brandColors = {
  primary: "#45776a",
  primaryDark: "#38554e",
  accent: "#83b9af",
  background: "#1f2b28",
  surface: "#150c10",
  textPrimary: "#afded6"
} as const;

export const themeColorVariables = {
  "--color-primary": brandColors.primary,
  "--color-primary-dark": brandColors.primaryDark,
  "--color-accent": brandColors.accent,
  "--color-background": brandColors.background,
  "--color-surface": brandColors.surface,
  "--color-text-primary": brandColors.textPrimary
} as const;
