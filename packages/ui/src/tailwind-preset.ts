import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

/**
 * Shared Tailwind preset — applies the Aura brand palette + Shadcn-compatible
 * semantic tokens. Dark-first. Consumers extend this in their own config.
 */
const preset: Partial<Config> = {
  darkMode: ['class'],
  plugins: [animate],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        brand: {
          100: 'hsl(var(--brand-100))',
          200: 'hsl(var(--brand-200))',
          300: 'hsl(var(--brand-300))',
          400: 'hsl(var(--brand-400))',
          500: 'hsl(var(--brand-500))',
          600: 'hsl(var(--brand-600))',
          700: 'hsl(var(--brand-700))',
          800: 'hsl(var(--brand-800))',
          900: 'hsl(var(--brand-900))',
          950: 'hsl(var(--brand-950))',
        },
        surface: {
          50: 'hsl(var(--surface-50))',
          100: 'hsl(var(--surface-100))',
        },
        violet: { DEFAULT: 'hsl(var(--accent-violet))' },
        pink: { DEFAULT: 'hsl(var(--accent-pink))' },
        amber: { DEFAULT: 'hsl(var(--accent-amber))' },
        mint: { DEFAULT: 'hsl(var(--accent-mint))' },

        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        sm: 'calc(var(--radius) - 4px)',
        md: 'calc(var(--radius) - 2px)',
        lg: 'var(--radius)',
        xl: 'var(--radius-lg)',
        '2xl': 'var(--radius-xl)',
      },
      fontFamily: {
        sans: ['Inter', 'Aileron', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fraunces', '"The Seasons"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glow: 'var(--shadow-glow)',
        card: 'var(--shadow-card)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 0 0 hsl(var(--ring) / 0.4)' },
          '50%': { boxShadow: '0 0 0 12px hsl(var(--ring) / 0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.25s ease-out',
        'slide-up': 'slide-up 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        'scale-in': 'scale-in 0.2s ease-out',
        float: 'float 4s ease-in-out infinite',
        glow: 'glow 2s ease-in-out infinite',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, hsl(var(--brand-700)) 0%, hsl(var(--accent-violet)) 50%, hsl(var(--accent-pink)) 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, hsl(var(--brand-700) / 0.9) 0%, hsl(var(--accent-violet) / 0.85) 100%)',
      },
    },
  },
}

export default preset
