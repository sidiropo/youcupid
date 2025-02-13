import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        'custom-green': {
          50: '#f5f7f4',
          100: '#e8ede7',
          500: '#99b991', // RGB: 153, 185, 145
          600: '#8aa782', // Slightly darker for hover states
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
