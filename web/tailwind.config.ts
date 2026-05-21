import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm-neutral tokens (avoid pure grays per global rules)
        surface: '#FAFAF7',
        ink: '#1F1B16',
        muted: '#6F6A62',
        line: '#E6E2D9',
        brand: '#1F5F4A',
        brandSoft: '#E6F2EC',
        danger: '#B0413E',
        warning: '#B97A1A',
        accent: '#2F6FB5',
      },
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', 'system-ui', 'sans-serif'],
      },
    },
  },
};
export default config;
