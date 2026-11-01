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
        // Semantic naming based on usage
        'badge': '6px',      // Small elements: badges, tags
        'button': '8px',     // Interactive elements: buttons, inputs
        'med': '10px',       // Medium elements: Quick Actions, Overview containers
        'card': '12px',      // Large cards: project cards
        'software': '14px',  // Software launchers
        'modal': '16px',     // Modals and dialogs
      },
      boxShadow: {
        'glow-green': '0 0 8px rgba(16, 185, 129, 0.5)',
        'glow-yellow': '0 0 8px rgba(245, 158, 11, 0.5)',
        'glow-blue': '0 0 8px rgba(59, 130, 246, 0.5)',
        'glow-accent': '0 0 8px var(--accent-color-border)',
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
        'checkmark-pop': {
          '0%': {
            transform: 'scale(0)',
            opacity: '0'
          },
          '50%': {
            transform: 'scale(1.2)',
          },
          '100%': {
            transform: 'scale(1)',
            opacity: '1'
          },
        },
        'shot-complete-glow': {
          '0%, 100%': {
            'box-shadow': '0 0 0 rgba(16, 185, 129, 0)'
          },
          '50%': {
            'box-shadow': '0 0 8px rgba(16, 185, 129, 0.3), inset 0 0 8px rgba(16, 185, 129, 0.1)'
          },
        },
        'slideDown': {
          '0%': {
            opacity: '0',
            transform: 'translateY(-4px)'
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)'
          },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'pulse-glow-yellow': 'pulse-glow-yellow 2s ease-in-out infinite',
        'pulse-glow-blue': 'pulse-glow-blue 2s ease-in-out infinite',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'checkmark-pop': 'checkmark-pop 0.3s ease-out',
        'shot-complete-glow': 'shot-complete-glow 0.6s ease-out',
        'slideDown': 'slideDown 0.15s ease-out',
        'fade-in': 'fade-in 0.2s ease-out forwards',
      },
    },
  },
  plugins: [],
}