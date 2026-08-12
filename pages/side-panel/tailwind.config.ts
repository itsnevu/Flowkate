import baseConfig from '@extension/tailwindcss-config';
import type { Config } from 'tailwindcss/types/config';

export default {
  ...baseConfig,
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    ...baseConfig.theme,
    extend: {
      // Spread the shared design tokens first — overwriting `theme` wholesale
      // would silently drop the Flowkite palette, shadows and radii.
      ...baseConfig.theme?.extend,
      keyframes: {
        ...baseConfig.theme?.extend?.keyframes,
        progress: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        ...baseConfig.theme?.extend?.animation,
        progress: 'progress 1.5s infinite ease-in-out',
      },
    },
  },
} as Config;
