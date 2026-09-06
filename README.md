# @meddleware/wallet-adapter

Shared Sui wallet adapter for Meddleware Vue 3 apps. A module-singleton composable built on
`@mysten/wallet-standard` so multiple tool views rendered in one window share a single wallet
connection.

## Install

```bash
npm install @meddleware/wallet-adapter
```

Peer deps: `@mysten/sui`, `@mysten/wallet-standard`, `vue`.

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
await exec.waitForTransaction(digest)

// read-only client
const client = getSuiClient(NETWORK, RPC[NETWORK])
```

Because the state is a module singleton, calling `useWallet()` from different components (or
different tool views) returns the **same** connection — connect once, everything sees it.

## Scripts

- `npm run type-check` — `vue-tsc --noEmit`
- `npm test` — vitest

No build step: the package ships TypeScript source, resolved by the consuming app's bundler.
