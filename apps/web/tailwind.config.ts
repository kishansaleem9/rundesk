import type { Config } from 'tailwindcss'
import preset from '@rundesk/ui/tailwind-preset'

export default {
  presets: [preset as Config],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
} satisfies Config
