import { defineConfig } from 'vitest/config'

// gRPC execution-path integration harness (real Sui full node + faucet). Gated by GRPC_TESTNET.
// Run with: GRPC_TESTNET=1 npm run test:integration
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.integration.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
})
