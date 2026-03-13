// tailwind.config.js
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
        },
        concrete: {
          50: '#f8f7f4',
          100: '#eeece6',
          200: '#dbd7cc',
          500: '#8b7355',
          600: '#6b5a44',
          700: '#4a3f31',
        },
      },
    },
  },
  plugins: [],
};
