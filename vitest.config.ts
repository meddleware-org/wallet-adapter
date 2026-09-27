import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // One Vue copy for SFCs and @vue/test-utils (events/reactivity must cross the boundary).
  resolve: { dedupe: ['vue', '@vue/test-utils'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['tests/integration/**', 'node_modules/**'],
  },
})
