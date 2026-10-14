import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    // Resolve `@import 'tailwindcss'` from this project, not the shell's cwd.
    '@tailwindcss/postcss': {
      base: dirname(fileURLToPath(import.meta.url)),
    },
  },
}

export default config
