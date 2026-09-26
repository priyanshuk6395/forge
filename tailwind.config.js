/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/index.html",
    "./public/styles.css",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#14171b",
        surface: "#1b1f24",
        "surface-raised": "#21262c",
        border: "#2a3037",
        "border-strong": "#3a4149",
        text: "#e8e6e1",
        "text-secondary": "#9ca1a8",
        "text-muted": "#666c73",
        accent: "#5a92b3",
        "accent-strong": "#7bacc9",
        success: "#7cae8a",
        warning: "#d6a55b",
        danger: "#d5715a",
      },
      borderRadius: {
        radius: "10px",
      },
      fontFamily: {
        sans: "IBM Plex Sans, -apple-system, BlinkMacSystemFont, sans-serif",
        mono: "IBM Plex Mono, 'SFMono-Regular', Consolas, monospace",
      },
    },
  },
  plugins: [],
}