/** Warna daripada pembolehubah CSS `--c-<nama>` (saluran "r g b"); menyokong `bg-primary/10`. */
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Semua warna asas dibaca daripada pembolehubah CSS (`--c-*`) yang diset oleh
      // `ThemeProvider` (`lib/theme.tsx`, nilai dalam `constants/theme.ts`) — sebab itu
      // `bg-surface`, `text-ink` dll. berubah mengikut tema cerah/gelap tanpa `dark:`.
      colors: {
        // Warna utama — forest / dark green
        primary: {
          DEFAULT: v('primary'),
          dark: v('primary-dark'),
          mid: v('primary-mid'),
          soft: v('primary-soft'), // background pill / ikon aktif
          tint: v('primary-tint'),
        },
        // Permukaan & teks
        background: v('background'),
        surface: v('surface'),
        ink: {
          DEFAULT: v('ink'),
          muted: v('ink-muted'),
          faint: v('ink-faint'),
        },
        line: v('line'),
        // Warna semantik
        positive: { DEFAULT: v('positive'), soft: v('positive-soft') },
        negative: { DEFAULT: v('negative'), soft: v('negative-soft') },
        warn: { DEFAULT: v('warn'), soft: v('warn-soft') },
        info: { DEFAULT: v('info'), soft: v('info-soft') },
      },
      borderRadius: {
        card: '20px',
        field: '16px',
        pill: '999px',
      },
      fontSize: {
        stat: ['34px', { lineHeight: '38px' }],
        'stat-sm': ['28px', { lineHeight: '30px' }],
        'stat-lg': ['44px', { lineHeight: '48px' }],
      },
      spacing: {
        gutter: '20px',
        card: '20px',
      },
    },
  },
  plugins: [],
};
