# CLAUDE.md — @meddleware/wallet-adapter

## What this package is

A shared Sui wallet adapter for Meddleware Vue 3 apps. It wraps `@mysten/wallet-standard`
(dapp-kit is React-only) in a **module-singleton** composable exposing reactive connection
state plus `connect` / `disconnect` / `signPersonalMessage` / `buildExecutor` / `getSuiClient`.

It exists to let multiple tool views (`walrus-ui`, `access-gate-ui`, `seal-ui`) share **one**
wallet connection when rendered inline in a single window (the dashboard). Before this package,
each app had its own near-identical `wallet.ts` singleton; three of them in one page meant three
separate connections.

## Architectural invariants

- **Module singleton.** `useWallet()` returns shared reactive state — every caller in the same
  window sees the same wallet/account. Do not turn this into per-component instance state; the
  shared connection is the entire reason the package exists.
- **Network-agnostic.** The RPC URL is a caller argument (`getSuiClient(network, rpcUrl)`,
  `buildExecutor(network, rpcUrl)`). Do NOT hardcode RPC URLs or read `import.meta.env` here —
  each consuming app resolves its own endpoint from env and passes it in.
- **Wallet-agnostic.** Never hardcode a specific wallet extension. Discovery is via
  wallet-standard `getWallets()`; operations are feature-guarded at call time.
- **No build step.** Ships TypeScript source; the consuming app's bundler resolves it via
  `"exports": { ".": { "default": "./src/index.ts" } }`.
- **Feature discovery is a union.** `useWallet({ requiredFeatures })` merges each caller's
  required features into one discovery filter (`standard:connect` is the baseline). A wallet in
  the list can serve every tool sharing the singleton. Individual operations still guard their
  own feature (`signPersonalMessage`, `signTransaction`) and throw a clear error if absent.

## Executor shape

`buildExecutor` returns `{ address, signAndExecute(tx), waitForTransaction(digest) }`. `address`
is included unconditionally (superset of the three original per-app variants). It executes the
signed transaction bytes through a `SuiJsonRpcClient` so the returned effects are controlled.

## Peer dependencies

Broad ranges on purpose (`@mysten/sui >=2.17 <3`, `@mysten/wallet-standard >=0.19 <1`) so
consumers on either the older (2.17/0.19) or newer (2.28/0.20) mysten lines can adopt it without
a peer conflict. The APIs used (`getWallets`, `isWalletWithRequiredFeatureSet`,
`SuiJsonRpcClient`, `executeTransactionBlock`, `waitForTransaction`, feature casting) are stable
across those ranges.

## What NOT to do

- Do not read env / hardcode RPC URLs — pass them in.
- Do not hardcode or prefer a specific wallet.
- Do not add a build step or emit `dist/`.
- Do not make the state non-singleton.
