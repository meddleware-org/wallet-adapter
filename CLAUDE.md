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

It exists to let multiple tool views (`walrus-storage-ui`, `access-gate-ui`, `sealed-storage-ui`) share **one**
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
- **Discovery lists every connectable wallet; requirements are per caller.** The shared list is
  filtered on `standard:connect` only. `useWallet({ requiredFeatures })` filters THAT caller's
  `wallets` list and never changes what another tool sees (a tool that needs
  `sui:signPersonalMessage` must not make a wallet vanish from every other tool's picker).
  Individual operations still guard their own feature (`signPersonalMessage`, `signTransaction`)
  and throw a clear error if absent.

## `createToolWallet`: a tool's wallet in one call

Each tool used to carry its own `wallet.ts` (~30 lines): bind the singleton to the selected network, pick which wallet features it needs, re-export a subset. `createToolWallet({ requiredFeatures })` is that, once:

```ts
// src/wallet.ts of a tool
import { createToolWallet } from '@meddleware/wallet-adapter'
export const { useWallet, getSuiClient, buildExecutor, signAndExecute } = createToolWallet({ requiredFeatures: ['sui:signTransaction'] })
```

It returns `useWallet()` (wallets, account, connect, … plus `signPersonalMessage`, `signAndExecute`, `getSuiClient`, `buildExecutor` bound to the network selected at call time) and those functions standalone. It adds no state: the connection and the network stay module singletons, so a tool built this way still shares the connection with every other tool in the window, and its `requiredFeatures` filter only its own list of wallets.

- `rpcUrlFor(network)` is the one place an endpoint is named (public fullnodes; localnet from `setLocalnetRpc`). Apps do not keep their own RPC tables.
- `setSuiClientOverride(network, client | null)` replaces the client for a network. Exported from `/testing`, not from the production entry (0.0.21). Test and end-to-end builds only: gRPC-web responses are binary and cannot be faked at the fetch layer, so a stub client is injected instead.
- `useWallet()`/`useNetwork()` return the same readonly views on every call, and the per-feature wallet lists are cached by feature set: they are called from many components, so nothing is rebuilt per call.

## `/testing`: the shared mock wallet

`@meddleware/wallet-adapter/testing` is for component tests, end-to-end builds and screenshots; an app imports it only from its e2e entry, behind its build flag (`if (import.meta.env.MODE === 'e2e') (await import('@meddleware/wallet-adapter/testing')).installE2eWallet()`), so no other build contains it.

- `createMockWallet` / `installMockWallet`: a real wallet-standard wallet registered with `getWallets()`, so the app's own discovery, picker and connect flow run unchanged. It signs with canned values unless given a `delegate`, which receives the transaction as JSON (`await tx.toJSON()`) and the chain, or the personal message as base64. Options leave out a signing feature, change the chains or make `connect` fail.
- `createStubClient({ executed, owned })` / `okTransaction`: a stand-in for the gRPC client (gRPC-web is binary and cannot be faked at the fetch layer), installed with `setSuiClientOverride`. It covers execute, wait and list-owned-objects only; an app that calls more passes its own object.
- `installE2eWallet`: all of it at once (wallet, stub client for testnet and mainnet, `window.__e2eAddress`, `__registerMockWallet`, `__unregisterMockWallet`). If a Playwright test exposed a Node signer (`exposeSigner` from `@meddleware/frontend-config/wallet`), the wallet signs through it, so a funded key stays in the test process.
- The Playwright side is `connectMockWallet(page)` (opens the app's wallet dialog and picks `Test Wallet`) and `exposeSigner(page, signer)`.

## Executor shape

`buildExecutor` returns `{ address, signAndExecute, waitForTransaction(digest) }`. It executes the
signed transaction bytes via `SuiGrpcClient` (`client.executeTransaction` /
`client.waitForTransaction`). `signAndExecute` returns once the node has the transaction; it does NOT
wait for indexing, so callers `waitForTransaction(digest)` before any dependent read.

- `signAndExecute(tx)` → `{ digest }`; **throws** when the transaction failed on-chain.
- `signAndExecute(tx, { include })` → `{ digest, success, result }` with the typed SDK
  `TransactionResult` (`effects`, `objectTypes`, `balanceChanges`, `events`, … as requested). It does
  **not** throw on an on-chain failure — callers check `success`. This is the one executor in the
  workspace; apps that need effects (e.g. token-issuance's publish flow) use it instead of their own
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
- **Chain checks.** `buildExecutor(network, …)` throws unless the account lists `sui:<network>` in
  its wallet-standard `chains` (that is what the account SUPPORTS, not the wallet UI's active
  network: the binding that matters is the explicit `chain` passed to `signTransaction`). It also
  reads the RPC's chain identifier once per network + URL and refuses a mismatch (testnet
  `4c78adac`, mainnet `35834a8a`). An executor remembers the network generation it was built in
  and refuses to sign after `useNetwork().setNetwork` / `setLocalnetRpc` changed it.
- **Connection errors are visible.** `WalletModal` stays open and renders `error` in a
  `role="alert"` region; concurrent `connect` calls are ignored while one is in flight.
- **Account binding.** An executor signs only for the account it was built with; after a
  disconnect or an account switch, `signAndExecute` throws instead of signing.

## Peer dependencies

`@mysten/sui` `^2.33.1` and `@mysten/wallet-standard` `>=0.21 <0.22` (0.x minors are breaking; widen after testing). The code itself needs 2.28 (the
`/grpc` subpath export and top-level `executeTransaction` / `waitForTransaction` are not available
earlier); the floor is 2.33.1 because `@mysten/wallet-standard` 0.21.30, `@mysten/seal` 1.4.16 and
`@mysten/walrus` 1.2.31 peer on `^2.33.1` (2.33.1 also raises its `@mysten/bcs` floor to 2.1.2), so
a lower floor would let consumers resolve a version those SDKs reject.
The APIs used (`getWallets`, `isWalletWithRequiredFeatureSet`, `SuiGrpcClient`, `executeTransaction`,
`waitForTransaction`, feature casting) are stable across that range.

## How consumers depend on it

A module singleton only works as one copy. Every embeddable tool view (dao-ui, treasury-ui,
access-gate-ui, sealed-storage-ui, walrus-storage-ui, token-issuance-ui) declares this package as a
**peerDependency** `>=0.0.12 <0.2.0` (plus a matching devDependency), so the host's single copy
satisfies all of them. A plain `^0.0.x` dependency means exactly that patch, and two tools on
different patches nest separate copies: separate connections. The host (the dashboard) has the
one real dependency. A new patch needs only the host bumped.

## UI dependency

The three components are built from `@meddleware/ui` primitives and the design tokens, with no literal colours, sizes or radii: `WalletModal` is a `UiButton` that opens a `UiDialog` (native `<dialog>`) holding `WalletSelector`, `UiLiveStatus` ("Connecting…", always mounted so it is announced) and a `UiNotice type="error"`; `WalletSelector` is a `<menu>` of `UiButton`s (a list of commands) with a `UiNotice` for look-alike names or for "no wallet detected"; `WalletGuard` is a `UiCard` splash. So `@meddleware/ui` and `@meddleware/design-tokens` are **peer dependencies** (every consuming app provides them); `@meddleware/web-utils` is a dependency (`safeIcon`: a wallet's icon is bound to `<img src>` only through it). There is no dependency in the other direction.

`WalletModal` has two top-level elements (the trigger and the dialog, which renders in the browser's top layer wherever it sits), so it sets `inheritAttrs: false` and forwards attributes to the trigger; `block` stretches the trigger to its container.

## Testing with the real ui

`@meddleware/ui` modules import their own `.css` (each component brings its CSS), which Node cannot import, so Vitest must process the UI libraries through Vite: `test.server.deps.inline: inlineMeddleware` from `@meddleware/frontend-config/vitest` (this also gives them the test's single copy of Vue, which is why tests no longer mock `@meddleware/ui`). A jsdom test that renders a dialog calls `installDialogShim()` from the same module.

## What NOT to do

- Do not read env / hardcode RPC URLs — pass them in.
- Do not hardcode or prefer a specific wallet.
- Do not add a build step or emit `dist/`.
- Do not make the state non-singleton.
