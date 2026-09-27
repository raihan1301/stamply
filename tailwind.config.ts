import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fef6f3",
          100: "#fdeae3",
          500: "#f04e23",
          600: "#d63f16",
          700: "#b23412",
        },
        ink: {
          900: "#1a1a2e",
          700: "#2d2d44",
          500: "#55556e",
        },
      },
    },
  },
  plugins: [],
};
export default config;
