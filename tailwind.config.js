/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Warna utama — forest / dark green
        primary: {
          DEFAULT: '#0F5132',
          dark: '#0A3A23',
          mid: '#157347',
          soft: '#E7F1EC', // background pill / ikon aktif
          tint: '#F2F8F5',
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
