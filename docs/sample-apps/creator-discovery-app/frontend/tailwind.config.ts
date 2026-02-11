import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Kandinsky design system from Pixeltable docs
        kblue: {
          DEFAULT: '#022A59',
          hover: '#08407B',
          light: '#7DA8EF',
          50: '#f0f5ff',
          100: '#dce8fc',
        },
        kyellow: {
          DEFAULT: '#F1AE03',
          hover: '#f5c842',
        },
        kred: {
          DEFAULT: '#DC2404',
        },
        kbeige: {
          DEFAULT: '#fafaf9',
          card: '#f5f5f4',
          hover: '#e7e5e4',
          border: '#d4d4d4',
        },
        kcta: '#070000',
        ktext: '#525252',
      },
      letterSpacing: {
        tight: '-0.02em',
      },
    },
  },
  plugins: [],
}

export default config
