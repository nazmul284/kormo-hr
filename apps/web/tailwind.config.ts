import type { Config } from 'tailwindcss';

/**
 * Colours are declared as CSS custom properties in globals.css and
 * referenced here, so light/dark swap in exactly one place and every
 * component is written against a role rather than a raw hex.
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // surfaces & ink
        page: 'rgb(var(--page) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-raised': 'rgb(var(--surface-raised) / <alpha-value>)',
        'surface-sunken': 'rgb(var(--surface-sunken) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-secondary': 'rgb(var(--ink-secondary) / <alpha-value>)',
        'ink-muted': 'rgb(var(--ink-muted) / <alpha-value>)',
        'ink-inverse': 'rgb(var(--ink-inverse) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        'line-strong': 'rgb(var(--line-strong) / <alpha-value>)',

        // brand
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          hover: 'rgb(var(--brand-hover) / <alpha-value>)',
          subtle: 'rgb(var(--brand-subtle) / <alpha-value>)',
          ink: 'rgb(var(--brand-ink) / <alpha-value>)',
          wash: 'rgb(var(--brand-wash) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          subtle: 'rgb(var(--accent-subtle) / <alpha-value>)',
        },

        /*
         * Status (reserved — never reused as a chart series).
         * `-ink` variants are the text-grade steps; the bare token is the
         * mark-grade fill. Using one token for both is what made the old
         * amber 1.79:1 against white.
         */
        good: 'rgb(var(--good) / <alpha-value>)',
        'good-ink': 'rgb(var(--good-ink) / <alpha-value>)',
        'good-subtle': 'rgb(var(--good-subtle) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        'warning-ink': 'rgb(var(--warning-ink) / <alpha-value>)',
        'warning-subtle': 'rgb(var(--warning-subtle) / <alpha-value>)',
        serious: 'rgb(var(--serious) / <alpha-value>)',
        'serious-subtle': 'rgb(var(--serious-subtle) / <alpha-value>)',
        critical: 'rgb(var(--critical) / <alpha-value>)',
        'critical-ink': 'rgb(var(--critical-ink) / <alpha-value>)',
        'critical-subtle': 'rgb(var(--critical-subtle) / <alpha-value>)',

        // Leave-type identity, drawn from the validated series.
        leave: {
          casual: 'rgb(var(--leave-casual) / <alpha-value>)',
          sick: 'rgb(var(--leave-sick) / <alpha-value>)',
          annual: 'rgb(var(--leave-annual) / <alpha-value>)',
          parental: 'rgb(var(--leave-parental) / <alpha-value>)',
          comp: 'rgb(var(--leave-comp) / <alpha-value>)',
          unpaid: 'rgb(var(--leave-unpaid) / <alpha-value>)',
        },

        // chart series (validated categorical slots, in fixed order)
        series: {
          1: 'rgb(var(--series-1) / <alpha-value>)',
          2: 'rgb(var(--series-2) / <alpha-value>)',
          3: 'rgb(var(--series-3) / <alpha-value>)',
          4: 'rgb(var(--series-4) / <alpha-value>)',
          5: 'rgb(var(--series-5) / <alpha-value>)',
        },
      },
      fontFamily: {
        // Geist, self-hosted via the `geist` package; the stack behind it is
        // the platform UI font, so a font that fails to load degrades to the
        // OS default rather than to Times.
        sans: [
          'var(--font-geist-sans)', 'system-ui', '-apple-system', 'Segoe UI',
          'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif',
        ],
        mono: [
          'var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo',
          'Consolas', 'monospace',
        ],
      },
      fontSize: {
        // A 6-step scale, tuned for Geist's x-height. Display sizes carry
        // negative tracking because a grotesque set tight reads as designed
        // and set loose reads as an accident.
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.005em' }],
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.875rem', { lineHeight: '1.3125rem' }],
        base: ['0.9375rem', { lineHeight: '1.4375rem' }],
        lg: ['1.0625rem', { lineHeight: '1.5rem', letterSpacing: '-0.011em' }],
        xl: ['1.25rem', { lineHeight: '1.625rem', letterSpacing: '-0.018em' }],
        '2xl': ['1.5rem', { lineHeight: '1.875rem', letterSpacing: '-0.022em' }],
        '3xl': ['1.875rem', { lineHeight: '2.1875rem', letterSpacing: '-0.028em' }],
        '4xl': ['2.375rem', { lineHeight: '2.625rem', letterSpacing: '-0.032em' }],
        '5xl': ['3.125rem', { lineHeight: '3.375rem', letterSpacing: '-0.036em' }],
      },
      borderRadius: {
        card: '0.75rem',
      },
      boxShadow: {
        card: '0 1px 2px -1px rgb(15 23 42 / 0.06), 0 2px 6px -2px rgb(15 23 42 / 0.05)',
        raised: '0 2px 4px -2px rgb(15 23 42 / 0.06), 0 8px 20px -6px rgb(15 23 42 / 0.12)',
        pop: '0 16px 40px -12px rgb(15 23 42 / 0.24), 0 4px 10px -4px rgb(15 23 42 / 0.10)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-up': 'slide-up 180ms ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
