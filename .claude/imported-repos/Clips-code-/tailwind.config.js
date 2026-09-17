/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,jsx}',
    './src/components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Dark "Clips" palette pulled from the reference recording.
        ink: {
          950: '#0a0a0c', // app background
          900: '#101013', // panels
          850: '#141417', // cards
          800: '#1a1a1f', // hovered cards / inputs
          700: '#26262c', // borders
          600: '#33333b',
        },
        rail: '#08080a', // far-left icon rail / sidebar
        brand: {
          DEFAULT: '#e5352b', // record red
          hover: '#f04438',
        },
        muted: '#8a8a94',
        faint: '#5c5c66',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        pop: '0 12px 40px -8px rgba(0,0,0,0.6)',
      },
      keyframes: {
        pulseRec: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        pulseRec: 'pulseRec 1.2s ease-in-out infinite',
        fadeIn: 'fadeIn 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
