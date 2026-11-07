/**
 * Clerk component appearance mapped to Polivo light design tokens.
 * Keeps auth surfaces consistent with `@polivo/ui` without a separate auth theme.
 */
export const polivoClerkAppearance = {
  variables: {
    colorPrimary: "#15803d",
    colorDanger: "#b91c1c",
    colorSuccess: "#166534",
    colorWarning: "#92400e",
    colorText: "#102f46",
    colorTextSecondary: "#526174",
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorInputText: "#102f46",
    colorNeutral: "#526174",
    borderRadius: "0.375rem",
    fontFamily: 'Inter, "Noto Sans Sinhala", system-ui, sans-serif',
    fontFamilyButtons: 'Inter, "Noto Sans Sinhala", system-ui, sans-serif',
  },
  elements: {
    rootBox: "w-full",
    cardBox: "shadow-none border border-[color:var(--border-default,#d9e1e8)]",
    headerTitle: "text-[color:var(--text-primary,#102f46)]",
    headerSubtitle: "text-[color:var(--text-muted,#526174)]",
    formButtonPrimary:
      "bg-[color:var(--accent-primary,#15803d)] hover:bg-[color:var(--accent-primary-hover,#166534)]",
    footerActionLink: "text-[color:var(--accent-primary,#15803d)]",
  },
} as const;
