/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 0 0 1px rgba(255,255,255,0.04), 0 12px 30px rgba(0,0,0,0.35)'
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif']
      },
      backgroundImage: {
        arcane:
          'radial-gradient(circle at top, rgba(168,85,247,0.18), transparent 36%), radial-gradient(circle at bottom right, rgba(56,189,248,0.12), transparent 30%), linear-gradient(180deg, #111114 0%, #09090b 100%)'
      }
    }
  },
  plugins: []
};
