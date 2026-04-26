/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#FF6B35',
          light: '#FFF0EB',
          dark: '#C24A1A',
          // keep old shades for any lingering references
          50:  "#FFF0EB",
          100: "#FFD9C7",
          500: "#FF6B35",
          600: "#FF6B35",
          700: "#C24A1A",
          900: "#8B2E0C",
        },
        sidebar: '#1A1A2E',
        success: {
          DEFAULT: '#1B9E5A',
          light: '#E6F7EE',
        },
        warning: {
          DEFAULT: '#E8A020',
          light: '#FEF3D7',
        },
        danger: {
          DEFAULT: '#E24B4A',
          light: '#FCEBEB',
        },
      },
    },
  },
  plugins: [],
};
