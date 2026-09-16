/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // DevPipeline Light — GitHub-derived semantic tokens (see DESIGN.md refs)
        background: '#ffffff',
        'on-background': '#1f2328',
        surface: '#f6f8fa',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f6f8fa',
        'surface-container': '#ffffff',
        'surface-container-high': '#f3f4f6',
        'surface-container-highest': '#eaeef2',
        'on-surface': '#1f2328',
        'on-surface-variant': '#656d76',
        outline: '#8c959f',
        'outline-variant': '#d0d7de',
        primary: '#0969da',
        'on-primary': '#ffffff',
        'primary-hover': '#0353a4',
        'primary-container': '#ddf4ff',
        'on-primary-container': '#0a3069',
        success: '#1a7f37',
        attention: '#9a6700',
        error: '#cf222e',
        done: '#8250df',
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        'display-lg': ['40px', { lineHeight: '48px', letterSpacing: '-0.02em', fontWeight: '600' }],
        'headline-lg': ['32px', { lineHeight: '40px', fontWeight: '600' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'headline-sm': ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '24px' }],
        'body-md': ['14px', { lineHeight: '20px' }],
        'body-sm': ['12px', { lineHeight: '18px' }],
        'label-caps': ['12px', { lineHeight: '1', letterSpacing: '0.05em', fontWeight: '600' }],
        'code-md': ['13px', { lineHeight: '20px' }],
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        gutter: '16px',
      },
      boxShadow: {
        card: '0 1px 0 rgba(31, 35, 40, 0.04)',
        overlay: '0 8px 24px rgba(140, 149, 159, 0.2)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(4px) scale(0.99)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'pop-in': 'pop-in 140ms ease-out',
      },
    },
  },
  plugins: [],
}
