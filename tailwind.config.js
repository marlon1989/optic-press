/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./*.html", "./src/js/**/*.js"],
  theme: {
    extend: {
      colors: {
        "on-primary": "var(--on-primary)",
        "tertiary-fixed-dim": "#cbc9e9",
        "surface-bright": "#f8f9fa",
        "surface-tint": "#005db5",
        "secondary-container": "#d2e5f4",
        "on-error-container": "#752121",
        "tertiary": "#5d5c78",
        "on-tertiary-container": "#4a4a65",
        "primary-fixed": "#d6e3ff",
        "surface-container-low": "var(--surface-container-low)",
        "inverse-on-surface": "#9b9d9e",
        "secondary-fixed-dim": "#c4d7e5",
        "primary": "var(--primary)",
        "outline-variant": "#abb3b7",
        "error": "#9f403d",
        "on-error": "#fff7f6",
        "primary-container": "var(--primary-container)",
        "tertiary-dim": "#51516c",
        "on-surface": "var(--on-surface)",
        "primary-fixed-dim": "#bfd5ff",
        "surface-container-lowest": "var(--surface-container-lowest)",
        "background": "var(--background)",
        "surface-variant": "#dbe4e7",
        "inverse-primary": "#5f9efb",
        "on-tertiary-fixed-variant": "#54546f",
        "surface-container-highest": "var(--surface-container-highest)",
        "on-primary-container": "var(--on-primary-container)",
        "surface-container-high": "#e3e9ec",
        "secondary-dim": "#435561",
        "on-secondary": "#f4f9ff",
        "on-secondary-container": "#425460",
        "inverse-surface": "#0c0f10",
        "on-primary-fixed-variant": "#005bb0",
        "surface-container": "#eaeff1",
        "on-tertiary": "#fbf7ff",
        "secondary-fixed": "#d2e5f4",
        "on-tertiary-fixed": "#383751",
        "outline": "#737c7f",
        "tertiary-fixed": "#d9d7f8",
        "surface-dim": "#d1dce0",
        "error-container": "#fe8983",
        "on-surface-variant": "var(--on-surface-variant)",
        "on-primary-fixed": "#003f7d",
        "primary-dim": "var(--primary-dim)",
        "on-background": "#2b3437",
        "error-dim": "#4e0309",
        "on-secondary-fixed-variant": "#4c5e6a",
        "surface": "var(--surface)",
        "tertiary": "var(--tertiary)"
      },
      fontFamily: {
        "headline": ['"Plus Jakarta Sans"', "sans-serif"],
        "body": ['"Plus Jakarta Sans"', "sans-serif"],
        "label": ['"Plus Jakarta Sans"', "sans-serif"],
        "sans": ['"Plus Jakarta Sans"', "sans-serif"]
      },
      borderRadius: { "DEFAULT": "0.125rem", "lg": "0.25rem", "xl": "0.5rem", "full": "0.75rem" },
      backgroundImage: {
        'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
        'glass-dark-gradient': 'linear-gradient(135deg, rgba(15, 23, 42, 0.1), rgba(15, 23, 42, 0.05))',
      },
      boxShadow: {
        'ambient': '0 0 40px rgba(43, 52, 55, 0.06)',
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries')
  ]
}
