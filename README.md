# @meddleware/wallet-adapter

Shared Sui wallet adapter for Meddleware Vue 3 apps. A module-singleton composable built on
`@mysten/wallet-standard` so multiple tool views rendered in one window share a single wallet
connection.

## Install

```bash
npm install @meddleware/wallet-adapter
```

Peer deps: `@mysten/sui`, `@mysten/wallet-standard`, `vue`, `@meddleware/ui` (used by `WalletModal` for its dialog).

## Usage

The RPC URL is passed in by the caller (each app resolves its own from env):

```ts
import { useWallet } from '@meddleware/wallet-adapter'

const RPC = { testnet: 'https://…', mainnet: 'https://…' }
const NETWORK = 'testnet'

const { wallets, account, connect, disconnect, signPersonalMessage, buildExecutor, getSuiClient } =
  useWallet({ requiredFeatures: ['sui:signTransaction'] })

// connect the first discovered wallet
if (wallets.value[0]) await connect(wallets.value[0])

// sign + execute a PTB
const exec = await buildExecutor(NETWORK, RPC[NETWORK])
const { digest } = await exec.signAndExecute(tx)
await exec.waitForTransaction(digest) // signAndExecute does not wait for indexing: wait before dependent reads

// read-only client
const client = getSuiClient(NETWORK, RPC[NETWORK])
```

Because the state is a module singleton, calling `useWallet()` from different components (or
different tool views) returns the **same** connection — connect once, everything sees it.

## Scripts

- `npm run type-check` — `vue-tsc --noEmit`
- `npm test` — vitest (hermetic)
- `GRPC_TESTNET=1 npm run test:integration` — reads a real full node: the chain identifiers the executor checks
  (testnet `4c78adac`, mainnet `35834a8a`) and the execution path `buildExecutor` uses (build → sign →
  `executeTransaction` → `waitForTransaction`). A browser wallet cannot run headless, so the execution test
  signs with a throwaway key. Fund it first (the testnet faucet pays into the address balance; see
  <https://faucet.sui.io> or its `/v3` API) and pass it as `WALLET_ADAPTER_FUNDED_KEY=suiprivkey1…`, or run
  against a local network: `GRPC_TESTNET=1 GRPC_TESTNET_NETWORK=localnet GRPC_TESTNET_URL=http://127.0.0.1:9000`
  (`sui start --with-faucet --force-regenesis`; its faucet funds the key). Without a funded key the test
  tries the shared faucet and may be rate-limited. No maintainer key is needed.

No build step: the package ships TypeScript source, resolved by the consuming app's bundler.
