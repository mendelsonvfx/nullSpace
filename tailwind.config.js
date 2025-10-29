/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        zinc: {
          950: '#09090b',
        },
        accent: {
          DEFAULT: 'var(--accent-color)',
          hover: 'var(--accent-color-hover)',
        }
      },
      textColor: {
        accent: 'var(--accent-color)',
      },
      fill: {
        accent: 'var(--accent-color)',
      },
      borderColor: {
        accent: 'var(--accent-color)',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': {
            'box-shadow': '0 0 8px rgba(34, 197, 94, 1)'
          },
          '50%': {
            'box-shadow': '0 0 13px rgba(34, 197, 94, 1)'
          },
        },
        'pulse-glow-yellow': {
          '0%, 100%': {
            'box-shadow': '0 0 8px rgba(234, 179, 8, 1)'
          },
          '50%': {
            'box-shadow': '0 0 13px rgba(234, 179, 8, 1)'
          },
        },
        'pulse-glow-blue': {
          '0%, 100%': {
            'box-shadow': '0 0 8px rgba(59, 130, 246, 1)'
          },
          '50%': {
            'box-shadow': '0 0 13px rgba(59, 130, 246, 1)'
          },
        },
        'slide-in-right': {
          '0%': {
            transform: 'translateX(20px)',
            opacity: '0'
          },
          '100%': {
            transform: 'translateX(0)',
            opacity: '1'
          },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'pulse-glow-yellow': 'pulse-glow-yellow 2s ease-in-out infinite',
        'pulse-glow-blue': 'pulse-glow-blue 2s ease-in-out infinite',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
      },
    },
  },
  plugins: [],
}