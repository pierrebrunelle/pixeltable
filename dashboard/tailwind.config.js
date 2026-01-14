/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Kandinsky brand colors (direct hex for use in components)
        kandinsky: {
          yellow: '#F1AE03',
          'yellow-hover': '#F6B506',
          red: '#DC2404',
          'red-dark': '#C82302',
          blue: '#022A59',
          'blue-light': '#7DA8EF',
          black: '#020704',
          gray: '#AAA498',
        },
        // Semantic colors (HSL variables from CSS)
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        // Legacy pxt-* aliases for backward compatibility
        'pxt': {
          'primary': '#F1AE03',        // kandinsky-yellow
          'primary-dark': '#C9930A',
          'secondary': '#7DA8EF',      // kandinsky-blue-light
          'background': '#020704',     // kandinsky-black
          'surface': '#0E110E',        // card
          'surface-light': '#1a1d1a',  // slightly lighter
          'border': '#2d2d2d',
          'text': '#f2f2f2',
          'text-muted': '#a3a3a3',
        },
      },
      fontFamily: {
        sans: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        'slide-up': {
          from: { opacity: 0, transform: 'translateY(10px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 5px hsl(var(--primary) / 0.3)' },
          '50%': { boxShadow: '0 0 15px hsl(var(--primary) / 0.5)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
