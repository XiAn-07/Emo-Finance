/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f6f7fb',
          100: '#eef0f8',
          200: '#d7dcee',
          300: '#b3bddf',
          400: '#8696c8',
          500: '#5f75b1',
          600: '#495b91',
          700: '#3a4872',
          800: '#2c3553',
          900: '#20263a',
        },
      },
      boxShadow: {
        soft: '0 10px 30px rgba(2, 6, 23, 0.08)',
      },
    },
  },
  plugins: [],
}
