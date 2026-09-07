# CLAUDE.md — @meddleware/wallet-adapter

## What this package is

A shared Sui wallet adapter for Meddleware Vue 3 apps. It wraps `@mysten/wallet-standard`
(dapp-kit is React-only) in a **module-singleton** composable exposing reactive connection
state plus `connect` / `disconnect` / `signPersonalMessage` / `buildExecutor` / `getSuiClient`.

## gRPC, not JSON-RPC

`getSuiClient` returns a `SuiGrpcClient` (`@mysten/sui/grpc`) and `buildExecutor` executes via
top-level `client.executeTransaction` + `client.waitForTransaction`. JSON-RPC (`SuiJsonRpcClient`)
is deprecated SDK-wide, so it is not used here. Consequences:

- **`rpcUrl` is a gRPC-web endpoint**, e.g. `https://fullnode.testnet.sui.io:443` — the default
  `GrpcWebFetchTransport` works in the browser. Do NOT pass a JSON-RPC-only endpoint.
- **Requires `@mysten/sui >= 2.28`** (the `/grpc` export does not exist earlier) — hence the peer
  range. Consumers passing `getSuiClient`'s client into data libraries must use libraries that
  accept a `SuiGrpcClient`, not JSON-RPC method shapes.

It exists to let multiple tool views (`walrus-ui`, `access-gate-ui`, `seal-ui`) share **one**
wallet connection when rendered inline in a single window (the dashboard). Before this package
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
signed transaction bytes via `SuiGrpcClient` (`client.executeTransaction` /
`client.waitForTransaction`) so the returned effects are controlled.

## Peer dependencies

Pinned to `@mysten/sui >=2.28 <3` and `@mysten/wallet-standard >=0.20 <1` — the `/grpc` subpath
export and top-level `executeTransaction` / `waitForTransaction` are not available before 2.28.
The APIs used (`getWallets`, `isWalletWithRequiredFeatureSet`, `SuiGrpcClient`, `executeTransaction`,
`waitForTransaction`, feature casting) are stable across that range.

## What NOT to do

- Do not read env / hardcode RPC URLs — pass them in.
- Do not hardcode or prefer a specific wallet.
- Do not add a build step or emit `dist/`.
- Do not make the state non-singleton.
