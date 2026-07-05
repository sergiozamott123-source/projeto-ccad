/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50:  '#eef0f4',
          100: '#d4d8e2',
          200: '#aab3c6',
          300: '#7f8daa',
          400: '#55678e',
          500: '#2b4172',
          600: '#20283B', // brand navy
          700: '#1a2030',
          800: '#131825',
          900: '#0d1019',
        },
        teal: {
          50:  '#e6f4f5',
          100: '#c0e4e7',
          200: '#90ced2',
          300: '#60b8be',
          400: '#30a2aa',
          500: '#0E7C86', // brand teal
          600: '#0b626b',
          700: '#084950',
          800: '#053135',
          900: '#02181a',
        },
        accent: {
          50:  '#fdf2ec',
          100: '#fae0cf',
          200: '#f5c2a0',
          300: '#f0a370',
          400: '#eb8540',
          500: '#E8703A', // brand orange
          600: '#ba5a2e',
          700: '#8b4322',
          800: '#5d2d17',
          900: '#2e160b',
        },
      },
    },
  },
  plugins: [],
}
