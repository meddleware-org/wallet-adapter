// Vitest settings for the unit tests: SFC support, one copy of Vue, and the Meddleware UI packages processed through Vite. The tests that need a real Sui node
// are in a separate config (vitest.integration.config.ts) and are not run here.
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { inlineMeddleware } from '@meddleware/frontend-config/vitest'

export default defineConfig({
  // The Vue plugin compiles the three single-file components the tests mount.
  plugins: [vue()],
  // One Vue copy for SFCs and @vue/test-utils (events/reactivity must cross the boundary).
  resolve: { dedupe: ['vue', '@vue/test-utils'] },
  test: {
    // Plain Node by default; the files that need a DOM say so with `// @vitest-environment jsdom` on their first line.
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // The integration tests need the network (a full node and a faucet) and run with their own config.
    exclude: ['tests/integration/**', 'node_modules/**'],
    // @meddleware/ui imports its own .css (each component brings its CSS), which Node cannot import: process it through Vite.
    server: { deps: { inline: inlineMeddleware } },
  },
})
