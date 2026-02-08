/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./frontend/src/**/*.{ts,tsx}",
    "./client/src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        "neon-cyan": "#00f3ff",
        "neon-purple": "#bc13fe"
      }
    }
  },
  plugins: []
};

