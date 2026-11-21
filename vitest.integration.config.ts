// Vitest settings for the integration tests (`npm run test:integration`): they talk to a real Sui full node and faucet, so they are slow, run one at a time and
// are skipped unless GRPC_TESTNET is set. Not part of CI.
import { defineConfig } from 'vitest/config'

// gRPC execution-path integration harness (real Sui full node + faucet). Gated by GRPC_TESTNET.
// Run with: GRPC_TESTNET=1 npm run test:integration
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.integration.test.ts'],
    // A network round trip plus a faucet request and a transaction can take a minute or more.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // One file at a time: the tests share a funded account, and parallel transactions from it would conflict.
    fileParallelism: false,
  },
})
