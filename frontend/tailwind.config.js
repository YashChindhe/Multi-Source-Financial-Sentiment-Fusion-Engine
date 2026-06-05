/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: '#0b0f19',
        darkSurface: '#121826',
        darkCard: '#1a2235',
        neonBlue: '#00d2ff',
        neonCyan: '#00f6ff',
        neonPurple: '#9d4edd',
        neonGreen: '#39ff14',
        neonRed: '#ff3b30'
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s infinite alternate',
        'spin-slow': 'spin 12s linear infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 210, 255, 0.2), 0 0 10px rgba(0, 210, 255, 0.1)' },
          '100%': { boxShadow: '0 0 15px rgba(0, 210, 255, 0.6), 0 0 30px rgba(0, 210, 255, 0.3)' }
        }
      }
    },
  },
  plugins: [],
}
