/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Background hierarchy (nullSpace colors)
        'app-bg': '#0a0a0a',
        'sidebar-bg': '#0f0f0f',
        'card-bg': '#141414',
        'hover-bg': '#1a1a1a',

        // Borders (nullSpace)
        'border-primary': '#1a1a1a',
        'border-secondary': '#262626',
        'border-hover': '#3f3f46',

        // Text colors (nullSpace)
        'text-primary': '#e4e4e7',
        'text-secondary': '#a1a1aa',
        'text-muted': '#71717a',
        'text-dim': '#52525b',

        zinc: {
          950: '#09090b',
        },

        // Accent color (keep existing variable-based system)
        accent: {
          DEFAULT: 'var(--accent-color)',
          hover: 'var(--accent-color-hover)',
          // Add default values for nullSpace purple gradient
          'default': '#8b5cf6',
          'default-hover': '#7c3aed',
        },

        // Status colors (nullSpace)
        status: {
          active: '#10b981',
          paused: '#f59e0b',
          completed: '#3b82f6',
          archived: '#71717a',
        },

        // Software colors (for gradients)
        software: {
          blender: '#f97316',
          ae: '#9333ea',
          houdini: '#ff4713',
          maya: '#0faded',
          cinema4d: '#0099d8',
          substance: '#f37a3a',
          unreal: '#313131',
          unity: '#000000',
          zbrush: '#f37021',
          photoshop: '#31a8ff',
          marmoset: '#ff6b00',
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
      borderRadius: {
        'card': '12px',
        'button': '8px',
        'badge': '6px',
        'software': '14px',
      },
      boxShadow: {
        'glow-green': '0 0 8px rgba(16, 185, 129, 0.5)',
        'glow-yellow': '0 0 8px rgba(245, 158, 11, 0.5)',
        'glow-blue': '0 0 8px rgba(59, 130, 246, 0.5)',
        'glow-accent': '0 0 8px rgba(139, 92, 246, 0.5)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.3)',
      },
      fontSize: {
        'project-title': '28px',
        'section-title': '14px',
        'card-title': '15px',
        'badge': '11px',
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