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
- **Requires `@mysten/sui` `^2.33.1`** (the `/grpc` export needs ≥ 2.28; the floor is 2.33.1 so
  one copy serves the upstream Mysten SDKs, which peer on `^2.33.1`) — hence the peer range. Consumers passing `getSuiClient`'s client into data libraries must use libraries that
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

`buildExecutor` returns `{ address, signAndExecute, waitForTransaction(digest) }`. It executes the
signed transaction bytes via `SuiGrpcClient` (`client.executeTransaction` /
`client.waitForTransaction`).

- `signAndExecute(tx)` → `{ digest }`; **throws** when the transaction failed on-chain.
- `signAndExecute(tx, { include })` → `{ digest, success, result }` with the typed SDK
  `TransactionResult` (`effects`, `objectTypes`, `balanceChanges`, `events`, … as requested). It does
  **not** throw on an on-chain failure — callers check `success`. This is the one executor in the
  workspace; apps that need effects (e.g. token-deployer's publish flow) use it instead of their own
  signing code.
- `buildExecutor(network, rpcUrl, { client })` executes and waits through the given client instead
  of the shared one (e.g. an app's own client, or a test build's stub). Signing, the chain check
  and the account binding are unchanged.

## Account and chain safety

- **Wallet change events.** `connect` subscribes to the wallet's `standard:events` `change` event.
  An account switch inside the wallet updates the reactive `account` (the current account is kept
  while the wallet still exposes it). A change reporting no accounts clears the connection. The
  listener is removed on disconnect. Consumers watch `account.value?.address` to reset per-account
  state (sessions, ownership checks).
- **Chain check.** `buildExecutor(network, …)` throws unless the account lists `sui:<network>` in
  its wallet-standard `chains`.
- **Account binding.** An executor signs only for the account it was built with; after a
  disconnect or an account switch, `signAndExecute` throws instead of signing.

## Peer dependencies

`@mysten/sui` `^2.33.1` and `@mysten/wallet-standard` `>=0.20 <1`. The code itself needs 2.28 (the
`/grpc` subpath export and top-level `executeTransaction` / `waitForTransaction` are not available
earlier); the floor is 2.33.1 because `@mysten/wallet-standard` 0.21.30, `@mysten/seal` 1.4.16 and
`@mysten/walrus` 1.2.31 peer on `^2.33.1` (2.33.1 also raises its `@mysten/bcs` floor to 2.1.2), so
a lower floor would let consumers resolve a version those SDKs reject.
The APIs used (`getWallets`, `isWalletWithRequiredFeatureSet`, `SuiGrpcClient`, `executeTransaction`,
`waitForTransaction`, feature casting) are stable across that range.

## How consumers depend on it

A module singleton only works as one copy. Every embeddable tool view (dao-ui, treasury-ui,
access-gate-ui, seal-ui, walrus-ui, token-deployer-ui) declares this package as a
**peerDependency** `>=0.0.12 <0.2.0` (plus a matching devDependency), so the host's single copy
satisfies all of them. A plain `^0.0.x` dependency means exactly that patch, and two tools on
different patches nest separate copies: separate connections. The host (the dashboard) has the
one real dependency. A new patch needs only the host bumped.

## UI dependency

`WalletModal` renders its picker in `@meddleware/ui`'s `UiDialog` (native `<dialog>`; Escape /
backdrop dismissal without interactive handlers on the dialog element), so `@meddleware/ui` is a
**peer dependency** — every consuming app already provides it. There is no dependency in the other
direction. `WalletSelector` renders the wallets as a `<menu>` of buttons (a list of commands), or a
single `<p>` when none are installed.

## What NOT to do

- Do not read env / hardcode RPC URLs — pass them in.
- Do not hardcode or prefer a specific wallet.
- Do not add a build step or emit `dist/`.
- Do not make the state non-singleton.
