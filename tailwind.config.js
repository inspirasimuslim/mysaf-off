/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Warna utama — mint
        primary: {
          DEFAULT: '#2FA695',
          dark: '#1B6B5F',
          mid: '#5FC4B3',
          soft: '#D9F2ED', // background pill / ikon aktif
          tint: '#F0FBF9',
        },
        // Permukaan & teks
        background: '#FAFAFA',
        surface: '#FFFFFF',
        ink: {
          DEFAULT: '#1A1A1A',
          muted: '#6B7280',
          faint: '#9CA3AF',
        },
        line: '#ECECEC',
        // Warna semantik
        positive: { DEFAULT: '#16A34A', soft: '#E8F6ED' },
        negative: { DEFAULT: '#DC2626', soft: '#FDECEC' },
        warn: { DEFAULT: '#EA580C', soft: '#FDF0E7' },
        info: { DEFAULT: '#2563EB', soft: '#EAF0FD' },
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
