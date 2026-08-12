import type { Config } from "tailwindcss";



const config: Config = {

  content: [

    "./pages/**/*.{js,ts,jsx,tsx,mdx}",

    "./components/**/*.{js,ts,jsx,tsx,mdx}",

    "./app/**/*.{js,ts,jsx,tsx,mdx}",

    "./lib/**/*.{js,ts,jsx,tsx,mdx}",

  ],

  theme: {

    extend: {

      colors: {

        brand: "#111827",

        "brand-dark": "#000000",

        "brand-bright": "#EC1D25",

        "brand-light": "#f5f5f5",

        "brand-sky": "#EC1D25",

        accent: "#EC1D25",

        "accent-hot": "#c81e1e",

        "accent-light": "#fef2f2",

        cream: "#fafafa",

        "section-gray": "#f5f5f5",

      },

      fontFamily: {

        sans: ["var(--font-nunito-sans)", "system-ui", "Segoe UI", "sans-serif"],

        serif: ["var(--font-rufina)", "Georgia", "serif"],

      },

      borderRadius: {

        zoomin: "80px 0 80px 0",

        sticker: "20px",

      },

    },

  },

  plugins: [],

};



export default config;

