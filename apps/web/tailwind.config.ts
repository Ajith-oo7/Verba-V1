import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F3EEE4",
        ink: "#1C1916",
        mute: "#6B635B",
        line: "#DDD4C6",
        cherry: "#B42318",
        cherryDark: "#8A1A12",
        moss: "#2F5D45",
        sand: "#E7DFD2",
      },
      fontFamily: {
        serif: ["Fraunces", "Georgia", "serif"],
        sans: ["Figtree", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        card: "0 18px 50px rgba(28, 25, 22, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
