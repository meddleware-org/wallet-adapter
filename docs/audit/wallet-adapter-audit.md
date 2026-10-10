# Security Audit — `wallet-adapter`

**Classification:** Internal security review (initial audit — awaiting external review)
**Project:** wallet-adapter (`@meddleware/wallet-adapter`) — the shared Sui wallet layer for every
Meddleware Vue app. It provides:

- a module-singleton composable over `@mysten/wallet-standard`: discovery, connect/disconnect,
  following account changes, `signPersonalMessage`;
- the one transaction **executor** in the workspace: `buildExecutor` → `signAndExecute` over
  `SuiGrpcClient`;
- the shared network selector (`useNetwork`);
- three Vue components (`WalletSelector`, `WalletModal`, `WalletGuard`).

**Project type:** TS/Vue library (ships TypeScript and SFC source; no build step).
**Template:**

- AUDIT_TEMPLATE.md (2026-10-08)
- AUDIT_TEMPLATE_VUE.md (2026-10-08) — names wallet-adapter (its Vue components); home of the
  signing UX and shared-wallet state
- AUDIT_TEMPLATE_SUI_CLIENT.md (2026-10-08) — the executor submits transactions; chain and network
  binding
- AUDIT_TEMPLATE_TS.md (2026-10-08)
- AUDIT_TEMPLATE_OPS.md (2026-10-08) — triggered by the real-chain integration harness (it signs on
  testnet with a throwaway or funded key; manual, moves a 1-MIST self-transfer)

Not triggered: SUI (no Move), SEAL, WALRUS, WORKERS, RUST, GO, IMG (a library: no image), SITE, AUTH,
PROXY. PLATFORM (draft, 2026-10-08) describes the environment, not this package.

**Deployment status:**

- npm `@meddleware/wallet-adapter` **0.0.17** (tag `v0.0.17` = `0561d0b`, 2026-10-08; SLSA v1
  provenance attestation verified; `latest`). 0.0.14 and 0.0.15 are also on npm; 0.0.14's chain check
  was wrong and 0.0.15 replaced it (F9). 0.0.16 was tagged but never published, because its publish job
  ran a missing build script (F10); 0.0.17 carries its changes.
- HEAD `1a93f9c` (2026-10-09) adds no source change after the tag: a Dependabot group (lockfile), the
  execution-suite funding fix (F11) and the README run notes.
- One real dependency in the host: the dashboard (`^0.0.17`). Every embedded tool declares it as a peer
  `>=0.0.12 <0.2.0` with a matching `^0.0.17` devDependency: walrus-ui, access-gate-ui, seal-ui,
  dao-ui (retired from the cluster, still published), treasury-ui, token-deployer-ui.
- Every signature in the product passes through it: purchases, consumes, airdrops, publishes,
  uploads and gateway proofs.
- Chain targets: testnet is live; mainnet publication of the apps is a maintainer/mainnet item. The
  adapter holds no package ids, so it needs no republish when Move packages change.

**Review date:** 2026-10-03 (first pass) · re-verified 2026-10-09
**Reviewer:** Internal review
**Severity ceiling:** High.

- It is the signing boundary for every app. A defect can:
  - sign for the wrong account or network;
  - report a failed transaction as done;
  - let one co-mounted view act through another's connection.
- The wallet extension is the user's independent confirmation step, which bounds the worst case.
- Realised ceiling at this pass: **Low** (no open finding; the three Low findings of the first pass are
  RESOLVED).

**Status:** first-pass baseline 2026-10-03; re-verified 2026-10-09 at `1a93f9c`. All 14 entries (13 findings and one Positive) have a
disposition: F1–F7 and F9–F11 RESOLVED (F1 with one ACCEPTED-RISK residual, F7 with one ADJUDICATED
sub-item), F12–F14 ACCEPTED-RISK, F8 Positive. Awaiting external review (a mainnet item).

**Front matter (VUE lens):**

| Field | Value |
| --- | --- |
| Build tool | none (ships source); dev: `@vitejs/plugin-vue` 6.0.9, Vue 3.5.43, `vue-tsc` 3.3 |
| Hosting | none (library) |
| Embedding hosts | dashboard (the singleton host) plus every standalone tool app |
| `VITE_*` inventory | none. Defaults: testnet and mainnet `https://fullnode.{net}.sui.io:443`, localnet `http://127.0.0.1:9000` |

**Front matter (TS lens):**

| Field | Value |
| --- | --- |
| Package manager / lockfile | npm; committed (`npm ci` in every workflow) |
| Module format | ESM source (`exports["."]` → `src/index.ts`, `types` → the same) |
| Publish model | ships `src` (10 files in the tarball, 34.7 kB unpacked, 12.1 kB packed) |
| Runtime targets | browsers through consumers' Vite builds |
| Peer dependencies | `@meddleware/ui ^0.1.31`, `@mysten/sui ^2.33.1`, `@mysten/wallet-standard >=0.21.0 <0.22`, `vue ^3.5.0` |
| Locked dev versions | `@mysten/sui` 2.34.0, `@mysten/wallet-standard` 0.21.32, `@meddleware/ui` 0.1.31, TypeScript 6.0.3, vitest 5.0.2 |

**Front matter (SUI_CLIENT lens):**

| Field | Value |
| --- | --- |
| Sui SDK | `@mysten/sui` peer `^2.33.1` (locked 2.34.0); the ADR-0001 baseline is `^2.33.1` — no deviation |
| Transport | gRPC (`SuiGrpcClient`, gRPC-web); no JSON-RPC anywhere |
| Networks | testnet, mainnet, localnet (the selector); `getSuiClient` also accepts the `devnet` label |
| On-chain packages consumed | none. The adapter holds no package or object ids; it signs and executes what the caller builds. It knows two chain ids (testnet `4c78adac`, mainnet `35834a8a`) for the RPC check, hard-coded and proven against the live nodes (F9) |

**Front matter (OPS lens):**

| Field | Value |
| --- | --- |
| CLI tools | none (no Sui or Walrus CLI). The harness is a Node vitest suite on `@mysten/sui` 2.34.0 |
| Networks targetable | `tests/integration/chain-id…`: read-only, testnet and mainnet public nodes. `tests/integration/grpc-exec…`: signs, on testnet (default) or localnet (`GRPC_TESTNET_NETWORK`); `GRPC_TESTNET_URL` is not checked against the network (F12) |
| Key material | a throwaway `Ed25519Keypair.generate()` funded from the faucet, or `WALLET_ADAPTER_FUNDED_KEY` (a funded testnet key, never a mainnet key) from the environment; nothing committed, no CI secret |

**Location:** `wallet-adapter/docs/audit/wallet-adapter-audit.md`. The directory is new in the
repo and not yet committed.

> **Access note:** `meddleware-org/wallet-adapter` `main` at `1a93f9c`, read from the workspace
> checkout (`repos/wallet-adapter`). The first pass used a detached clone at `origin/main`. Nothing in
> the source was changed by either pass.

---

## Executive summary

The source is `wallet.ts` (426 lines), `network.ts` (101) and three SFCs (220), with 41 tests in 5 files
plus two manual integration suites (chain identifier, gRPC execution).

**What holds (verified 2026-10-09):**

- **Account binding.** An executor signs only for the wallet and account it was built with. After a
  disconnect or an in-wallet account switch, `signAndExecute` throws instead of signing (tested).
- **Network binding.** An executor also remembers the network generation it was built in and refuses to
  sign after `setNetwork` / `setLocalnetRpc` changed it (F1, tested).
- **Explicit chain, checked RPC.** The chain (`sui:<network>`) is passed to the wallet's
  `signTransaction`, and `buildExecutor` reads the RPC's chain identifier once per network + URL and
  refuses a mismatch (testnet and mainnet; F1, F9; the live node ids pass today).
- **Transactions passed through untouched.** The adapter does not mutate or inject into them.
- **On-chain failure surfaced.**
  - The plain `signAndExecute` throws on a `FailedTransaction`.
  - The `include` form returns `success` taken from the effects status.
  - Both are tested. The executor returns once the node has the transaction; callers call
    `waitForTransaction` before dependent reads, and the docs now say so (F5).
- **Wallet-standard handling.**
  - `change` events update the account, keep the current one while it is listed, and clear the
    connection on an empty account list.
  - The listener is removed on disconnect.
  - Extension objects are `markRaw`ed.
- **Shared discovery.** The shared wallet list is filtered on `standard:connect` only; a tool's
  `requiredFeatures` filters its own list (F2, tested).
- **Visible connection failures.** `WalletModal` renders the error in a `role="alert"` region, concurrent
  connects are ignored, and a rejecting wallet `disconnect` is swallowed (F3, tested).
- **Wallet icons.** Only `data:image/(svg+xml|webp|png|gif);base64` icons are rendered (`<img>`, so
  SVG script cannot run). Look-alike names get a warning and distinct keys (F4).
- **Storage.** It holds only the network name and a localhost-only localnet URL. Values are
  validated on read and storage failures tolerated (tested). Nothing about accounts or signatures is
  persisted.
- **RPC.** `https:` only, plus `http://localhost` / `http://127.0.0.1`, one rule in both modules (F6).
- **Gates.** `vue-tsc`, eslint (including vuejs-accessibility), stylelint and html-validate clean;
  41/41 tests; coverage 91.6% statements / 84.5% branches; an expiring audit allowlist (1 dev-only
  advisory); SHA-pinned actions; npm pinned; provenance; the tag workflow runs the same checks as CI.

**Findings (none open):**

1. **F1–F7 (first pass: three Low, four Info) are all RESOLVED** in 0.0.14–0.0.17 (commits `d654744`,
   `cea73fb`, `d2e8db5`, `0561d0b`), each pinned by tests. Residual choices: the wallet's *active*
   network cannot be read through wallet-standard, so F1 keeps the explicit `chain` as the binding
   (ACCEPTED-RISK part); the gRPC harness stays manual by design (F7, ADJUDICATED part).
2. **F9 (Low, RESOLVED).** The first F1 fix (0.0.14, published) compared the node's base58 genesis digest
   with the short id and would have refused every transaction; 0.0.15 maps the digest to its first four
   bytes and a live test pins it. A mocked client had hidden the wrong format.
3. **F10 (Info, RESOLVED).** 0.0.16 never reached npm: the publish job ran a `build` script this package
   lacks. Fixed in 0.0.17.
4. **F11 (Info, RESOLVED).** The execution suite counted gas coins as "funded"; the testnet faucet now pays
   into the address balance, so it failed after a good funding. Fixed `4e49d0e`; suite PASS 2026-10-09.
5. **F12–F14 (Info, ACCEPTED-RISK).** The manual execution harness does not check its URL against its
   network label (F12); the chain-id table is indexed by a caller-supplied name without `Object.hasOwn`,
   which fails closed because the account chain check runs first (F13); the wallet components are not in a
   real-browser axe gallery, only their token roles are contrast-checked (F14).

**Posture:**

- The signing path is careful: account-bound, network-bound, chain-explicit, failure-surfacing, no
  mutation.
- The guard rails the first pass found weak (network check, discovery filter, connect error surfacing)
  are fixed and tested. What remains is the wallet-side trust that cannot be checked from a dapp: the
  wallet honouring `chain`, and the user reading the wallet's own confirmation.
- The first pass recorded findings only, by maintainer instruction; the fixes since are cited per
  finding and in the re-verification log.

---

## Threat model / trust boundaries

### Frontend actor matrix (VUE lens)

| Actor | What it controls | Bounded by |
| --- | --- | --- |
| End user + wallet extension | wallet choice, the account, the wallet's active network, approval of every signature | the wallet's own confirmation UI; account binding; chain passed explicitly; network generation (F1). Connect failures shown (F3) |
| Other wallet extensions in the browser (any extension can register) | name, icon, features, accounts | data-URI icon filter; text-rendered name; duplicate-name warning and distinct keys (F4) |
| Co-mounted tool views (same bundle) | the shared connection: `signPersonalMessage`, executors, `requiredFeatures` | SECURITY.md invariant 1 (first-party only); per-caller feature filters (F2) |
| Consuming app | `network`, `rpcUrl`, the transactions it builds, an injected execution client | https/localhost checks; the wallet signs only what it shows; RPC chain identifier checked against `network` (F1, F9) |
| Full node at `rpcUrl` | execution results and effects | the wallet signed the bytes; `FailedTransaction` surfaced; chain identifier checked for testnet and mainnet. A lying node could still report success (the wallet's confirmation and the digest are the user's evidence) |
| Browser storage | the stored network and localnet URL | validated on read; failures tolerated |

### On-chain / network dependency matrix (SUI_CLIENT lens)

| Item | Source | Used as | If stale / wrong | Fails |
| --- | --- | --- | --- | --- |
| Chain id `sui:<network>` | caller's `network` | `signTransaction` `chain`; account check | wallet signs for that chain; the account check rejects a chain the account does not list | closed for an unlisted chain; otherwise depends on the wallet honouring `chain` |
| RPC `rpcUrl` | caller / `useNetwork` | `executeTransaction`, `waitForTransaction` | wrong-network node: `buildExecutor` refuses (testnet, mainnet); devnet and localnet are not checked | closed (tested; live ids pass) |
| Known chain ids (`4c78adac`, `35834a8a`) | hard-coded in `wallet.ts` | RPC check | a wrong constant would refuse every transaction (F9) | closed; proven against the live nodes |
| Executor binding | wallet + account + network generation at build time | the refusal checks | account switch / disconnect / network switch ⇒ throw | closed (tested) |

### Supply chain & input matrix (TS lens)

| Actor / source | Controls | Bounded by |
| --- | --- | --- |
| Dependency authors (peers supplied by the host) | `@mysten/sui`, `@mysten/wallet-standard`, `@meddleware/ui`, `vue` | host lockfile; the dashboard's single-copy rule; narrowed `wallet-standard` peer (F7) |
| Untrusted inputs | wallet objects (names, icons, accounts, `signTransaction` results); execution results; the node's chain identifier | icon filter; result discrimination; the identifier is decoded and compared, a malformed one throws |

### Operations matrix (OPS lens)

| Actor / asset | Power | Bounded by |
| --- | --- | --- |
| Throwaway or funded testnet key (env) | signs the 1-MIST self-transfer in the execution suite | testnet faucet funding; a key from the environment only; never a mainnet key (README, F12) |
| Public fullnodes and faucet | execution and funding in the suites | manual runs; failure fails the test |
| CI | runs no real-chain job | the suites are manual (`GRPC_TESTNET=1`) and not in any workflow |

#### Script inventory (OPS lens)

| Script / job | Signs? | Objects touched | Irreversible? | Dry-run default | Confirmation | Network guard | Writes IDs to |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `tests/integration/chain-id.integration.test.ts` | no | none (reads the chain identifier) | no | self-skips without `GRPC_TESTNET` | n/a | fixed public URLs | nothing |
| `tests/integration/grpc-exec.integration.test.ts` | yes (throwaway or funded testnet key) | a self-transfer of 1 MIST plus gas | spends gas on testnet | self-skips without `GRPC_TESTNET` | n/a | label restricted to `testnet` / `localnet`; URL unchecked (F12) | nothing |

---

## Severity scale

Critical / High / Medium / Low / Info / Positive.

## Scope

**In scope (`1a93f9c`; release `v0.0.17` = `0561d0b`):**

- `src/{wallet,network,index}.ts`, `src/{WalletSelector,WalletModal,WalletGuard}.vue`
- `tests/**`, including `integration/grpc-exec.integration.test.ts` and
  `integration/chain-id.integration.test.ts`
- `package.json`, the lockfile, `vitest*.config.ts`, eslint, stylelint and html-validate configs
- `.github/**`
- `README.md`, `CLAUDE.md`, `SECURITY.md`, `CHANGELOG.md`

**Cross-repo evidence (read-only):**

- consumers' executor use (`waitForTransaction` after `signAndExecute` in access-gate-ui,
  walrus-ui, walrus-relay, token-deployer-ui);
- the `@mysten/sui` gRPC core (`executeTransaction` result shape) in `node_modules`;
- the design-tokens contrast gate (`scripts/check-contrast.mjs`), for the colour roles the components use.

**Out of scope:** wallet extensions; consumers' transaction contents (their audits).

**Environment / commands (2026-10-09, Node 24.13.0; CI uses Node 24):**

| Command | Result |
| --- | --- |
| `npm ci` | clean |
| `npm run type-check` / `npm run lint` | clean / exit 0 (stylelint, eslint, html-validate) |
| `npx vitest run` | **41 passed** (5 files) |
| `npx vitest run --coverage` (v8) | 91.58% statements / 84.49% branches / 95.45% functions / 93.98% lines. `WalletGuard.vue` 100% lines; `wallet.ts` uncovered `:170-180` (`signPersonalMessage` success path); `network.ts` uncovered `:84-91` (`setLocalnetRpc` success path) |
| `node .github/audit-gate.mjs` / `npm audit --omit=dev` | 1 high dev advisory (braces, allowlisted until 2027-01-01) / 0 |
| `npm pack --dry-run` | 10 files, 12.1 kB packed, 34.7 kB unpacked |
| `npm view @meddleware/wallet-adapter` | `latest` = 0.0.17, SLSA v1 provenance; versions 0.0.14 and 0.0.15 present, 0.0.16 absent |
| `GRPC_TESTNET=1 npm run test:integration` (chain-id file only) | **2 passed**: the live testnet and mainnet nodes' identifiers map to `4c78adac` and `35834a8a` |
| gRPC execution suite (`grpc-exec`) | PASS on testnet 2026-10-09 (maintainer run, after the funding fix `4e49d0e`; F11). Not re-run in this pass: it signs and needs a funded key |

The first pass's scratch jsdom probes for F2, F3 and F4 are replaced by committed tests (see each
finding). The workspace checkout was not modified.

---

## Findings

### F1 — The network-mismatch guard checks supported chains, not the wallet's active network; `rpcUrl` is not bound to `network`

**Severity:** Low (the explicit `chain` on `signTransaction` is the real binding)
**Disposition:** RESOLVED in 0.0.14 / 0.0.15 (`d654744`, `cea73fb`); the wallet's *active* network stays
ACCEPTED-RISK (not readable by a dapp; OQ1 answered)
**Where:** first pass: `src/wallet.ts:235-240` (`assertAccountOnChain`), `:256-273` (`buildExecutor`),
`:53-66` (`getSuiClient`); `src/network.ts:55-81` (`setNetwork`); CLAUDE.md "Chain check". Now
`src/wallet.ts:253` (`assertAccountOnChain`), `:280` (`assertRpcServesNetwork`), `:308` (`buildExecutor`),
`:56` (`getSuiClient`); `src/network.ts:59` (`networkGeneration`), `:72-95` (`setNetwork`, `setLocalnetRpc`).

**Issue:**

- **What the check reads.** `assertAccountOnChain` asserts that `account.chains` includes
  `sui:<network>`. In the wallet-standard model, `WalletAccount.chains` lists the chains the account
  *supports*. Sui wallets conventionally list all Sui chains for every account, so the check passes
  regardless of which network the wallet UI is set to. (This is the general convention; it was not
  verified against each extension.)
- **What the error claims.** "The connected wallet account does not support sui:testnet … Switch the
  wallet's network." It implies network-mismatch detection that will rarely occur.
- **What actually binds.** The binding that matters is the `chain` argument passed to
  `signTransaction`. Correct handling then depends on each wallet honouring it.
- **`rpcUrl` ↔ `network`.** `buildExecutor(network, rpcUrl)` never checks that `rpcUrl` serves
  `network`: no chain-identifier read and no check against the defaults. A mismatched pair submits
  bytes signed for one chain to another's node.
- **Network switches.** `useNetwork().setNetwork()` does not invalidate executors already built or
  the connection. An executor captured before a switch still signs for the old chain and submits to
  the old RPC. Consumers currently build an executor per action, so this is latent.

**Impact:** VUE-M4's "block signing on a network mismatch" and SC-M5 are met only to the extent that
wallets honour `chain` and callers pair `network` with `rpcUrl` correctly. The adapter's own check
gives little assurance.

**Remediation / evidence (first-pass recommendation, now implemented):**

- Name the check for what it is ("account cannot sign for this chain").
- Where the wallet exposes its active chain (some wallets publish it through `standard:events`
  `chains`, or a `sui:` feature), compare against that.
- In `buildExecutor`, read the RPC's chain identifier once (cached) and compare it with the known
  chain id for `network` (testnet `4c78adac`, mainnet `35834a8a`). Refuse on a mismatch.
- Bump a network generation on `setNetwork`, and have executors check it before signing (as the
  account binding does).

**Remediation / evidence (2026-10-09):** RESOLVED by 0.0.14 (`d654744`) and 0.0.15 (`cea73fb`); the CHANGELOG starts
at 0.0.16, so these two are documented in the git history only.

- **Named for what it checks.** The error reads "The connected wallet account cannot sign for sui:… (it
  lists: …)" and the JSDoc and CLAUDE.md "Chain checks" say it tests account *support*, with the explicit
  `chain` on `signTransaction` as the binding. Pinned by `tests/wallet.test.ts` "refuses to build an
  executor for a chain the account does not list".
- **RPC bound to network.** `assertRpcServesNetwork` reads `core.getChainIdentifier()` once per
  network + URL (cached in `verifiedRpcs`) and refuses a mismatch for testnet and mainnet; devnet and
  localnet have no fixed id and are not checked; an injected client without the call is skipped. Pinned
  by "refuses an RPC that serves another chain than the network, and caches a good answer". The first
  version of this check was wrong (F9).
- **Network switch.** `networkGeneration()` is bumped by `setNetwork` and `setLocalnetRpc` on a real
  change; an executor built earlier throws "The selected network changed; rebuild…". Pinned by "an
  executor built before a network switch refuses to sign after it".
- **OQ1 answered.** Wallet-standard gives a dapp no active-network read (the account lists what it
  supports), so the adapter does not claim to detect it. The residual (a wallet that ignores `chain`)
  is ACCEPTED-RISK: the wallet's confirmation UI shows the network and the user approves it, and the
  guard rails above catch the cases the adapter can see.

### F2 — A feature required by one tool hides wallets from every tool

**Severity:** Low   **Disposition:** RESOLVED in 0.0.14 (`d654744`)
**Where:** first pass: `src/wallet.ts:43-46, 68-75, 350-361`; JSDoc at `:347-348` ("widens the discovery
filter (union); it never narrows another caller's view"); CLAUDE.md "Feature discovery is a union". Now
`src/wallet.ts:49` (`BASELINE`), `:408-422` (`useWallet`); CLAUDE.md "Discovery lists every connectable
wallet; requirements are per caller".

**Issue (probe-verified):**

- `requiredFeatures` is a global set, and discovery keeps only wallets that support **all** of it.
  The *requirements* form a union, so the *wallet list* is an intersection.
- Probe: wallets Alpha, Beta, Slush and Slush were registered (only Beta supports
  `sui:signPersonalMessage`).
  - The first `useWallet()` caller saw `Alpha,Beta,Slush,Slush`.
  - After another view called `useWallet({ requiredFeatures: ['sui:signPersonalMessage'] })`, the
    **first caller's** list became `Beta`.
- Requirements are never removed when the requiring view unmounts.
- The currently connected wallet is not re-validated against new requirements, so the list and the
  connection can disagree.

**Impact:** in the dashboard, mounting one tool (for example walrus-ui's gated upload, which needs
personal-message signing) can make the user's wallet vanish from the connect picker for every tool.
That is an availability and confusion problem. The docs state the opposite.

**Remediation / evidence:**

- Filter discovery only on `standard:connect`. Keep per-operation feature guards (already present),
  and show unsupported operations as disabled in the tool that needs them.
- Or keep per-caller requirements and expose per-caller filtered lists.
- Correct the JSDoc and CLAUDE.md.
- Add the probe as a test (the merge path `:352-359` is currently uncovered).

**Remediation / evidence (2026-10-09):** RESOLVED by the first option. The shared list is filtered on
`standard:connect` only (`BASELINE`); `useWallet({ requiredFeatures })` returns a computed view over it for
THAT caller and registers nothing globally, so the requirements are no longer a global set and nothing
can hide a wallet from another tool. Each operation keeps its own feature guard
(`signPersonalMessage`, `signTransaction`). The JSDoc on `UseWalletOptions` / `useWallet` and CLAUDE.md
state the per-caller rule. The probe is a test: `tests/discovery.test.ts` "filters only the caller that
asked; the shared list keeps every connectable wallet". OQ2 is answered by the design: wallets are never hidden from other
tools, and an operation on a wallet that lacks its feature throws a clear error; whether a tool also
disables that action in its UI is the tool's own UX (their audits).

### F3 — Connection failures are invisible to the user

**Severity:** Low   **Disposition:** RESOLVED in 0.0.14 (`d654744`)
**Where:** first pass: `src/WalletModal.vue:20-23` (`onSelect` awaits `connect`, with no `catch`), the
template (renders only "Connecting…"); `src/wallet.ts:125-152` (`connect` sets `error` and rethrows;
`disconnect` uses `void disc?.disconnect?.()`); `src/WalletGuard.vue` (no error display). Now
`src/WalletModal.vue:20-27` and the template, `src/wallet.ts:131` (`connect`), `:155` (`disconnect`).

**Issue (probe-verified):**

- A wallet whose `connect` rejected with "User rejected the request" left the dialog open with
  **no visible message**.
- The rejection propagated out of the click handler to Vue's `errorHandler`; in production that is
  a console error.
- `useWallet().error` held the message, but neither `WalletModal` nor `WalletGuard` renders it.
- `disconnect()` discards the wallet's `disconnect()` promise, so a rejection there becomes an
  unhandled rejection. The local state is cleared regardless (acceptable).
- Concurrent `connect` calls (a double click, or two wallets clicked) are not serialised. The last
  to resolve wins, and the other's event listener is dropped. That is consistent, but not
  necessarily the user's last choice.

**Impact:**

- Users see a picker that "does nothing" after a rejection, a locked wallet or a wallet error.
- Apps cannot rely on the shared components for error UX.
- For a signing gateway this is a usability defect, and it invites retries.

**Remediation / evidence:**

- In `WalletModal`, catch in `onSelect` and render `error` in a `role="alert"` region inside the
  dialog. Mirror it in `WalletGuard`.
- Ignore a `connect` while `connecting` is true, or cancel the earlier one.
- Use `disc?.disconnect?.().catch(() => {})`.
- Add an unmocked component test (the current tests mock `wallet.js`).

**Remediation / evidence (2026-10-09):** RESOLVED, all four points.

- `WalletModal.onSelect` catches the rejection (a justified empty `catch`: the reason is in `error`), the
  dialog stays open, and the template renders `error` in a `role="alert"` paragraph (`role="status"` while
  connecting). `WalletGuard` renders `WalletModal`, so the splash shows it too; it needs no second display.
- `connect` returns at once when `connecting` is true, so a double click or a second wallet is ignored.
- `disconnect` wraps the wallet's promise in `Promise.resolve(...).catch(() => {})`: a rejection is
  swallowed on purpose (the local state is cleared regardless; documented in the code).
- Tests: `tests/components.test.ts` "stays open and shows the reason when the wallet rejects…";
  `tests/modal-real.test.ts` "shows a rejected connection in the modal, which stays open" (real wallet
  module, registered fake wallets); `tests/wallet.test.ts` "ignores a connect while another is in flight",
  "a wallet whose disconnect rejects does not raise an unhandled rejection", "a connect failure is exposed
  through error and rethrown".
- Observation: `error` lives in the singleton and is cleared by the next `connect`, so a reopened dialog
  shows the previous failure until the user picks a wallet. Cosmetic; it never grants anything.

### F4 — Look-alike wallets are indistinguishable in the picker

**Severity:** Info   **Disposition:** RESOLVED in 0.0.16 (`d2e8db5`; published as 0.0.17)
**Where:** first pass: `src/WalletSelector.vue:20-26` (`:key="w.name"`, renders icon + name only). Now
`src/WalletSelector.vue:12-18` (`duplicateNames`) and `:30-40` (the template).

**Issue / Impact:**

- Any browser extension can register a wallet-standard wallet with any name and icon.
- Probe: two wallets named "Slush" (one whose `connect` threw "impostor") rendered as two identical
  buttons.
- `:key` on the name is not unique either.
- The real protection is the wallet's own confirmation UI, but the choice of wallet is made here.

**Remediation / evidence:**

- Warn when two registered wallets share a name ("Multiple wallets named X — check your
  extensions").
- Key by index or by registration identity.
- Optionally show `w.version` or a features summary.

**Remediation / evidence (2026-10-09):** RESOLVED. `WalletSelector` computes the names that occur more than
once and renders a `role="note"` warning ("Several wallets are named “X”. Check your browser extensions
before choosing one."); the list is keyed by position + name (`${i}:${w.name}`), so look-alikes are
distinct entries. Pinned by `tests/modal-real.test.ts` "warns when two wallets share a name, and keys them
apart" and "shows no warning when every name is distinct". Showing `w.version` or a features summary was
optional and is not done: ADJUDICATED, because extensions control those fields too, so they would not
distinguish an impostor; the wallet's own confirmation remains the real protection.

### F5 — The docs promise "await finality", which the executor does not do

**Severity:** Info   **Disposition:** RESOLVED in 0.0.16 (`d2e8db5`; published as 0.0.17)
**Where:** first pass: `src/wallet.ts:216` (`Executor` JSDoc: "sign+execute a PTB and await finality");
CLAUDE.md "`buildExecutor` executes via … `client.executeTransaction` + `client.waitForTransaction`". Now
the `Executor` JSDoc (`src/wallet.ts:227-244`), CLAUDE.md "Executor shape", README Usage.

**Issue / Impact:**

- `signAndExecute` calls only `executeTransaction`. `waitForTransaction` is a separate method the
  caller must invoke.
- Today's consumers do call it: access-gate-ui `gates.ts:112`, walrus-ui `MyBlobs.vue`, walrus-relay
  `useAccessGate`, token-deployer-ui `deployExecutor`.
- A new consumer trusting the JSDoc could read state before it is indexed.

**Remediation / evidence:** wait inside `signAndExecute` (optionally opt-out), or correct the
JSDoc, CLAUDE.md and README to say "execute; call `waitForTransaction` before dependent reads".

**Remediation / evidence (2026-10-09):** RESOLVED by the documentation option. The `Executor` JSDoc says
execution "returns once the node has the transaction; it does NOT wait until the transaction is indexed",
CLAUDE.md says the same, and the README example calls `exec.waitForTransaction(digest)` before dependent
reads. OQ3 decided by this change: `signAndExecute` does not wait by default (callers that only need the
digest are not slowed; the executor exposes `waitForTransaction`, and wait errors are not swallowed).

### F6 — Small inconsistencies in URL and network handling

**Severity:** Info   **Disposition:** RESOLVED in 0.0.16 (`d2e8db5`; published as 0.0.17), with the client
cache ACCEPTED-RISK
**Where:** first pass: `src/wallet.ts:29-34, 62`; `src/network.ts:6-11, 60-63`. Now `src/wallet.ts:33`
(`isAllowedGrpcUrl`), `:56-71` (`getSuiClient`); `src/network.ts:6-11` (`isLocalUrl`), `:72-95`.

- `isAllowedGrpcUrl` accepts **any scheme** on `localhost`/`127.0.0.1` (for example `ws://`,
  `ftp://`), while `network.ts` `isLocalUrl` requires `http:`. Use one rule.
- `network as SuiNetwork` casts any string into the gRPC client's network label (used for MVR
  resolution and defaults).
- `setNetwork` has no runtime validation: a JavaScript caller can store an unknown name. `rpcUrl`
  then becomes `undefined` and `getSuiClient` throws, so it fails closed.
- The client cache is unbounded but keyed on `(network, url)`; it is small in practice.

**Remediation / evidence (2026-10-09):**

- **One URL rule.** `isAllowedGrpcUrl` is `https:` or `isLocalUrl` (`http://localhost` /
  `http://127.0.0.1`), the same helper `network.ts` uses; `ws://` and `ftp://` on localhost are refused.
  Pinned by `tests/wallet.test.ts` "accepts https anywhere and plain http only on localhost / 127.0.0.1,
  with one rule".
- **The label cast.** `getSuiClient` throws for a network outside `GRPC_NETWORKS`
  (mainnet, testnet, devnet, localnet) before the `as SuiNetwork` cast, so the cast is now backed by a
  runtime check ("refuses an unknown network label").
- **`setNetwork` validation.** It throws for a name outside `MW_NETWORKS` instead of storing it
  (`tests/network.test.ts` "refuses an unknown network name instead of storing it"); stored values were
  already validated on read.
- **Client cache.** Unchanged: ACCEPTED-RISK. The key is the caller's `(network, url)` pair, both
  validated, and an app uses a handful of endpoints; an attacker cannot reach the key.

### F7 — Tests, CI and peer range

**Severity:** Info
**Disposition:** RESOLVED in 0.0.16 / 0.0.17 (`d2e8db5`, `0561d0b`); the gRPC harness staying manual is
ADJUDICATED (OPS lens)

- **Mocked component tests.** `tests/components.test.ts` mocks both `../src/wallet.js` and `UiDialog`,
  so the real modal → `connect` → error path (F3) is never exercised. `WalletGuard` is at 0%.
- **gRPC harness outside CI.** It is manual, needs testnet egress and optionally
  `WALLET_ADAPTER_FUNDED_KEY` (a funded testnet key, which should never be a mainnet key).
- **CI flags.** Lint runs with `--if-present` in Node CI and not at all in publish `verify`;
  `verify` also uses `--if-present` for test and build.
- **Wide `wallet-standard` peer range.** `>=0.20.0 <1` admits 0.x minors, which are breaking by
  semver convention, and only 0.21.27 is tested.
- **Stale dev copy of ui.** `@meddleware/ui` is 0.1.28 (latest 0.1.30).
- **Hard-coded fallbacks.** `#6366f1`, `#fff`, `#888` and `#333` in components (cf. ui F8).

**Remediation / evidence:**

- Add an unmocked jsdom test with registered fake wallets (the probes above are a starting point).
- Schedule the gRPC harness with a funded testnet key secret.
- Drop `--if-present`; lint in `verify`.
- Narrow the peer to `>=0.21 <0.22`, or test the bounds.

**Remediation / evidence (2026-10-09):**

- **Unmocked tests.** RESOLVED. `tests/modal-real.test.ts` mounts the real `WalletModal`, `WalletSelector`
  and `WalletGuard` over the real wallet module with registered fake wallets (rejected connect,
  look-alikes, the connect splash); `tests/discovery.test.ts` and `tests/wallet.test.ts` cover the
  wallet module's discovery, change events, chain/RPC/network binding and connect serialisation. 41 tests
  in 5 files; `WalletGuard.vue` 100% lines (was 0%).
- **gRPC harness outside CI.** ADJUDICATED, not scheduled in CI. The OPS lens (Section C) makes real-chain
  harness runs manual, each recorded with its date and result, and says mainnet keys never live in CI; a
  scheduled job would need a funded testnet secret and a protected environment for a 1-MIST self-transfer.
  The suites are documented in the README (`GRPC_TESTNET=1 npm run test:integration`, funding, localnet
  option) and no maintainer key is needed. Runs: execution suite PASS on testnet 2026-10-09 (after F11);
  chain-id suite PASS 2026-10-09 (this pass, both live nodes). The hermetic suite, which runs in CI,
  covers the executor logic with a fake client.
- **CI flags.** RESOLVED. `node-ci.yml` runs `npm ci`, the audit gate, `type-check`, `lint` (no
  `--if-present`) and `npm test`; `npm-publish.yml`'s `verify` job calls that same workflow
  (`workflow_call`), so a tag runs the checks on the tagged commit. (`0561d0b` also removed a `build` step
  the package does not have: F10.)
- **Peer range.** RESOLVED. `@mysten/wallet-standard` is `>=0.21.0 <0.22` (CLAUDE.md records why: 0.x
  minors are breaking); locked 0.21.32.
- **Stale ui.** RESOLVED. Peer and dev range `^0.1.31`, locked 0.1.31.
- **Hard-coded colour fallbacks.** RESOLVED. `src/` contains no hex colour; components use only token
  variables (`--text`, `--muted`, `--accent`, `--danger`, `--warning-text`, `--surface`, `--lift`,
  `--border`). Contrast evidence is F14.

### F8 — Positive: an account-bound, chain-explicit executor that surfaces on-chain failure

**Severity:** Positive

- **Account binding.** The executor captures the wallet and account at build time and refuses to
  sign after any change. The error asks callers to rebuild, because a transaction built for another
  sender must never be presented (tested with in-wallet switches).
- **Transactions.** Passed unmodified to `sui:signTransaction`, with an explicit `chain`. The signed
  bytes are executed as returned (the wallet is the trust anchor).
- **Results.**
  - The plain form throws on `FailedTransaction`, and on an unexpected kind.
  - The `include` form returns `success` only for `$kind === 'Transaction'` with
    `status.success`, while still exposing the effects.
  - Both tested.
- **Injected clients.** The injected `ExecutionClient` option keeps signing, the chain check and
  binding unchanged.
- **Wallet events.** Follows in-wallet account switches and clears the connection on an empty list.
  The listener is removed on disconnect.
- **Discovery and rendering.** `markRaw` for extension objects; icons restricted to Wallet Standard
  data URIs; names rendered as text.
- **Network selection.** Persisted values validated (the localnet URL must be `http://localhost` or
  `http://127.0.0.1`); storage failures tolerated; no account, signature or secret ever stored.
- **Network and RPC binding (added since the first pass).** An executor refuses to sign after a network
  switch, and `buildExecutor` refuses an RPC whose chain identifier is not the network's (testnet,
  mainnet); both tested, and the identifier mapping is proven against the live nodes (F1, F9).
- **Connect UX (added).** Failures are shown, concurrent connects ignored, look-alike names warned
  (F3, F4).
- **Release.** SHA-pinned actions, npm 11.20.0 pinned, OIDC `--provenance` (0.0.17 verified), tag =
  version checked in the job, expiring audit allowlist, and the tag workflow runs the CI checks.

### F9 — The first RPC chain-identifier check refused every transaction (published as 0.0.14)

**Severity:** Low (availability: signing refused, never a wrong signature)
**Disposition:** RESOLVED in 0.0.15 (`cea73fb`)
**Where:** `src/wallet.ts:261-299` (`KNOWN_CHAIN_IDS`, `shortChainId`, `assertRpcServesNetwork`);
`tests/integration/chain-id.integration.test.ts`. Found 2026-10-08 while checking the F1 fix.

**Issue / Impact:**

- The F1 fix in 0.0.14 compared `getChainIdentifier()` directly with the short ids (`4c78adac`,
  `35834a8a`). A node reports the base58 genesis checkpoint digest (testnet `69WiPg3D…`), so the compare
  failed on every network and `buildExecutor` would have thrown on every call for any consumer that
  upgraded to 0.0.14.
- A stubbed client in the unit tests returned the short form, so the hermetic suite passed.

**Remediation / evidence:** 0.0.15 adds `shortChainId` (base58 → first four bytes → hex; throws on fewer
than four bytes) and compares that. Pinned by `tests/wallet.test.ts` "shortChainId" (the real identifiers
public nodes report) and the live suite `GRPC_TESTNET=1 npm run test:integration`
(`chain-id.integration.test.ts`: both nodes map to `4c78adac` and `35834a8a`; passed again 2026-10-09).
0.0.14 stays on npm; `latest` is 0.0.17. Every consumer now declares `^0.0.17`. Lesson
recorded: verify external formats against the live service, not a stub.

### F10 — 0.0.16 was tagged but never published

**Severity:** Info
**Disposition:** RESOLVED in 0.0.17 (`0561d0b`)
**Where:** `.github/workflows/npm-publish.yml` (a `Build` step, `npm run build`); CHANGELOG 0.0.16 "(not
published)" and 0.0.17.

**Issue / Impact:** the release-gate change in 0.0.16 (the tag workflow runs the CI workflow) left a
`npm run build` step in the publish job; this package ships source and has no `build` script, so the job
failed and 0.0.16 never reached npm. The failure was visible (no release), not silent.

**Remediation / evidence:** the step was removed and 0.0.17 published with the 0.0.16 changes (npm
`latest` 0.0.17, provenance verified 2026-10-09). The job's tag-equals-version check and idempotent
publish are unchanged.

### F11 — The execution suite counted gas coins as "funded" and failed after the faucet changed

**Severity:** Info
**Disposition:** RESOLVED (`4e49d0e`, 2026-10-09)
**Where:** `tests/integration/grpc-exec.integration.test.ts` (`hasFunds`); README "Scripts".

**Issue / Impact:** the testnet faucet now pays into the address balance, not into a gas coin object. The
suite looked for gas coins, so it waited and then failed with "address must be funded" although funding
had succeeded. Test-only; no source or release was affected.

**Remediation / evidence:** `hasFunds` reads `client.core.getBalance({ owner })` and counts the balance.
The README explains the faucet behaviour (the web faucet or its `/v3` API, or a localnet faucet) and that
no maintainer key is needed. The suite then PASSED on testnet on 2026-10-09 (build → sign → `executeTransaction` →
`waitForTransaction`). The test still calls the top-level `client.executeTransaction` /
`client.waitForTransaction`, the same calls `buildExecutor` makes.

### F12 — The execution harness does not check its URL against its network label

**Severity:** Info
**Disposition:** ACCEPTED-RISK
**Where:** `tests/integration/grpc-exec.integration.test.ts` (`BASE_URL`, `NETWORK`, `FUNDED_KEY`).
(OPS lens: Preflight, Key custody.)

**Issue / Impact:**

- The suite builds `new SuiGrpcClient({ network, baseUrl })` from `GRPC_TESTNET_URL` and
  `GRPC_TESTNET_NETWORK`, with no read of the node's chain identifier. If an operator set the URL to a
  mainnet node and supplied a mainnet-funded key as `WALLET_ADAPTER_FUNDED_KEY`, the 1-MIST self-transfer
  plus gas would run on mainnet.
- The label is a TypeScript cast limited to `testnet | localnet`; the URL is free.

**Why accepted:** the suite is manual, self-skips unless `GRPC_TESTNET=1`, runs in no workflow, and its
worst case is a self-transfer of 1 MIST and gas from a key the operator chose to put in the environment;
the README states the key is a funded testnet key and that no maintainer key is needed. The default URL is
the public testnet node. A cheap hardening (assert `shortChainId` of the node equals the label's id or
the localnet case before signing, reusing the F9 helper) would remove the case; it is not required for
testnet and is listed as S5.

### F13 — The chain-id table is indexed by a caller-supplied name without `Object.hasOwn`

**Severity:** Info
**Disposition:** ACCEPTED-RISK
**Where:** `src/wallet.ts:261, 281` (`KNOWN_CHAIN_IDS[network]`). (TS lens: caller-keyed lookups.)

**Issue / Impact:** `network` is a caller string, and `KNOWN_CHAIN_IDS` is a plain object, so a key such
as `constructor` resolves to a prototype member instead of `undefined`. It is not reachable in a harmful
way: `getSuiClient` rejects unknown labels (`GRPC_NETWORKS.includes`, an array), `useNetwork` validates
against `MW_NETWORKS`, and `buildExecutor` runs `assertAccountOnChain` (`sui:<network>` must be in the
account's chains) before `assertRpcServesNetwork`, so a name like `constructor` fails closed before the
table is read. Other lookups (`DEFAULT_RPC[...]`) are indexed by already validated values.

**Why accepted:** unreachable and fail-closed (the guard order is in `buildExecutor`; the unlisted-chain
test covers the first guard). Using
`Object.hasOwn` (or a `Map`) is a one-line change for the next patch release and is listed as S6.

### F14 — Colour contrast of the components is covered by token role, not by a real-browser run

**Severity:** Info
**Disposition:** ACCEPTED-RISK
**Where:** `src/WalletSelector.vue`, `src/WalletModal.vue`, `src/WalletGuard.vue` (`<style scoped>`);
`tests/components.test.ts` (vitest-axe in jsdom); the design-tokens `scripts/check-contrast.mjs`.
(VUE lens: Colour & links.)

**Issue / Impact:** the VUE lens asks for WCAG AA contrast in every theme × season, checked in a real
browser over a gallery loaded with the real tokens. This library defines no palette: it draws text only in
`--text`, `--muted`, `--danger` and `--warning-text`, on `--surface` (picker, dialog) and on the host's
background (`--muted` trigger and splash). The design-tokens gate checks those roles at 4.5:1 on `--bg`
and `--surface` for every theme × season. Not covered: the wallet components themselves are not in the ui
gallery (jsdom axe cannot compute contrast), and some pairs are outside the gate's list (`--text` on
`--lift` for the hovered option, `--muted` on a host background other than `--bg` / `--surface`, and the
`--border` outlines). The picker's warning and error text carry
`role` and wording, so they do not rely on colour alone, and the hover state only changes a background.

**Why accepted:** the risk is a low-contrast hover or border in some theme, not a security impact. The
cross-repo follow-up (add `WalletSelector` / `WalletModal` to the ui component gallery) is listed as S7.

---

## Section A — Invariant verification matrix

| # | Invariant (source) | Enforced at | Proven by | Status |
| --- | --- | --- | --- | --- |
| A1 | Module singleton: one connection per window (CLAUDE.md; SECURITY.md 1) | module state | tests | HOLDS (first-party co-mounting assumption documented) |
| A2 | Adapter never mutates transactions (SECURITY.md 2) | `signAndExecute` | inspection | HOLDS |
| A3 | No secrets, accounts or signatures persisted (SECURITY.md 3) | `network.ts` storage | tests; grep | HOLDS |
| A4 | Signing fails closed without a wallet or feature (SECURITY.md 4) | guards | tests | HOLDS |
| A5 | https/localhost gRPC only (SECURITY.md 5) | `isAllowedGrpcUrl` (one rule with `isLocalUrl`) | tests | HOLDS (F6 RESOLVED) |
| A6 | Executor bound to its account (CLAUDE.md) | `signAndExecute` | tests | HOLDS |
| A7 | **Network mismatch blocked (CLAUDE.md "Chain checks"; VUE-M4; SC-M5)** | `assertAccountOnChain` (named for account support); `assertRpcServesNetwork`; network generation | tests; live chain-id suite | **HOLDS** for the RPC and for switches inside the app; the wallet's *active* network is not readable by a dapp (F1, ACCEPTED-RISK part) |
| A8 | On-chain failure never reported as success (CLAUDE.md) | `digestFromExecuteResult`; `success` | tests | HOLDS |
| A9 | **Discovery never narrows another caller's view (JSDoc)** | `BASELINE` + per-caller computed list | `tests/discovery.test.ts` | **HOLDS** (F2 RESOLVED) |
| A10 | **Connect errors reach the user** | `WalletModal` `role="alert"` | component and real-module tests | **HOLDS** (F3 RESOLVED) |
| A11 | RPC serves the requested network (testnet, mainnet) | `assertRpcServesNetwork`, cached per network + URL | `wallet.test.ts`; live `chain-id.integration` | HOLDS (devnet / localnet unchecked by design; F9 format defect fixed) |
| A12 | An executor refuses to sign after a network switch | `networkGeneration()` | `wallet.test.ts` | HOLDS |
| A13 | Execution returns at node acceptance; callers wait before dependent reads | `Executor` docs; `waitForTransaction` | docs; consumers' calls | HOLDS (F5 RESOLVED) |
| A14 | Look-alike wallet names are not indistinguishable | `WalletSelector` | `modal-real.test.ts` | HOLDS (F4 RESOLVED) |

---

## Section B — Supply-chain, publish-authority & capability matrix

### B.1 Dependency & CVE risk

| Dependency | Range (locked) | Role | Status |
| --- | --- | --- | --- |
| `@mysten/sui` | peer `^2.33.1` (2.34.0) | gRPC client, utils | clean |
| `@mysten/wallet-standard` | peer `>=0.21.0 <0.22` (0.21.32) | discovery and types | clean; range narrowed (F7) |
| `@meddleware/ui` | peer `^0.1.31` (0.1.31) | `UiDialog` | clean |
| `vue` | peer `^3.5.0` (3.5.43) | runtime | clean |
| Dev toolchain | lockfile | — | braces advisory (allowlisted, dev-only, expires 2027-01-01) |

**Shared-dependency version matrix (TS lens; baseline: ADR-0001 `@mysten/sui ^2.33.1`, one copy per bundle):**

| Dependency | peer | dev | locked | Deviation |
| --- | --- | --- | --- | --- |
| `@mysten/sui` | `^2.33.1` | `^2.33.1` | 2.34.0 | none |
| `@mysten/wallet-standard` | `>=0.21.0 <0.22` | `^0.21.0` | 0.21.32 | none (ADR-0001 cites 0.21.30; the `@mysten/sui` peer floor above carries its `^2.33.1` requirement) |
| `@mysten/bcs` | not declared | — | 2.1.2 (transitive of `@mysten/sui`) | none; not used directly |
| `@mysten/walrus`, `@mysten/walrus-wasm`, `@mysten/seal` | not used | — | — | n/a |
| `vue` | `^3.5.0` | `^3.5.43` | 3.5.43 | none |
| `typescript` | — | `~6.0.0` | 6.0.3 | none (TypeScript 7 is a deferred decision) |
| `vitest` | — | `~5.0.2` | 5.0.2 | none (same `~5.0.2` as the sibling TypeScript packages) |
| `@meddleware/ui` (first-party) | `^0.1.31` | `^0.1.31` | 0.1.31 | the 0.1.x line, not a `0.0.x` pin |

First-party `0.0.x` ranges: this package depends on no `0.0.x` package. Its consumers declare it as a
peer `>=0.0.12 <0.2.0` (so the host's single copy serves every embedded tool) with a `^0.0.17`
devDependency; that peer range is deliberate (CLAUDE.md "How consumers depend on it") and is audited in
the consumers' B.1.

### B.2 Publish authority & CI

| Authority | Where | Custody | Gates |
| --- | --- | --- | --- |
| npm publish `@meddleware/wallet-adapter` | `npm-publish.yml` (tag `v*`) | OIDC + `--provenance`; npm 11.20.0 | `verify` = the CI workflow on the tagged commit: audit gate, type-check, lint, test. Tag must equal the package version; publish is idempotent |

#### CI & release integrity

| Item | Holds? | Evidence |
| --- | --- | --- |
| Actions pinned; least privilege | Yes | workflows (SHA pins; `contents: read`, `id-token: write` only on the publish job) |
| Audit gate with expiry | Yes | `.github/audit-gate.mjs`, `.github/audit-allowlist.json` (1 entry, expires 2027-01-01); runs in CI and, through `verify`, in the release |
| Lint in publish verify | Yes | `verify` calls `node-ci.yml` (F7) |
| Release gate equals CI | Yes | `workflow_call` |
| Dependabot | Yes | `.github/dependabot.yml`: weekly, grouped (npm minor/patch, actions) |
| Live execution path in CI | No, by design | manual suites (F7, ADJUDICATED; OPS lens) |
| Test-only code in the shipped source | None | no mock or test hook in `src/`; `files: ["src"]` |

### B.TS-1 Packaging

`exports["."]` → `src/index.ts` (types the same); `files: ["src"]` (10 files in the tarball, 34.7 kB
unpacked); `sideEffects: ["*.vue"]` is accurate (the TypeScript modules have module-level state but no
import-time effects beyond refs). Ships source: type-checks under the consumers' settings (the dashboard
and the tools build it with their own `vue-tsc`).

### B.TS-2 / B.TS-3

There are no lifecycle scripts, `allowScripts` or `overrides`. The lockfile is committed and every
workflow installs with `npm ci`; the audit gate (`npm audit` at high/critical minus the expiring
allowlist) runs in CI and in the release; npm is pinned to 11.20.0 in the publish job.

### B.SC-1 ID / endpoint trace

| Location | Value | Kind |
| --- | --- | --- |
| `network.ts:15-19` | `https://fullnode.{testnet,mainnet}.sui.io:443`, `http://127.0.0.1:9000` | default gRPC-web endpoints |
| `wallet.ts:261` | testnet `4c78adac`, mainnet `35834a8a` | known chain ids; match the live nodes (chain-id suite, 2026-10-09) |
| `wallet.ts:313` | `sui:${network}` | wallet-standard chain id |

### B.OPS-1 Runbook linkage

Both integration suites are described in the README "Scripts" section with their purpose, the gating
variable (`GRPC_TESTNET=1`), the funding step (the faucet pays into the address balance;
`WALLET_ADAPTER_FUNDED_KEY` or localnet) and the localnet option. There is no dry-run or recovery command
to document: the execution suite spends gas on a throwaway or testnet-only key and writes nothing.

---

## Section C — Test-coverage & hermetic/live split

### C.1 Coverage grade — B+ (41/41; 91.6% statements, 84.5% branches, measured 2026-10-09)

| Dimension | Assessment |
| --- | --- |
| Happy path | Client memoisation; change events; executor include path; injected client; picker markup; icons; real modal → connect; chain-id mapping against real identifiers |
| Error path | No-wallet guards; `FailedTransaction`; unexpected kind; unlisted chain; wrong-chain RPC; network switch; account changed; connect rejected (component and real module); concurrent connect; rejecting disconnect; storage throws or is tampered; unknown network name; non-https/localhost URL. **Missing:** `signPersonalMessage` success path (`wallet.ts:170-180`; exercised by the consumers' gateway-proof flows) |
| Boundary | Feature-filter interplay (`discovery.test.ts`); duplicate names (`modal-real.test.ts`); network switch with a live executor. **Missing:** `setLocalnetRpc` success path (`network.ts:84-91`) |
| Security-relevant | Account binding, network binding, RPC binding and failure surfacing proven. The wallet honouring `chain` is not testable without a real extension |

**Test layers:**

| Layer | Files | In CI? |
| --- | --- | --- |
| Unit / component (jsdom, mocks) | 5 files, 41 tests | yes (`npm test`) |
| Chain-identifier check (real public nodes, read-only) | `tests/integration/chain-id.integration.test.ts` | **no** (manual, `GRPC_TESTNET=1`) |
| gRPC execute + wait (real testnet node, keypair) | `tests/integration/grpc-exec.integration.test.ts` | **no** (manual, `GRPC_TESTNET=1`) |
| Real wallet extension | none (needs a browser extension) | no |

Real-chain runs used as evidence: chain-id suite PASS 2026-10-09 (this pass); execution suite PASS on
testnet 2026-10-09 (after F11).

### C.2 Hermetic vs. live paths

| Path | Hermetic? | Deferred to | Tracking |
| --- | --- | --- | --- |
| Wallet `signTransaction` honouring `chain` | no | consumers' real-chain e2e (token-deployer-ui's injected wallet) and the wallet's own confirmation | F1 (ACCEPTED-RISK part) |
| gRPC execute and wait | fake client | manual harness (OPS lens: manual, dated runs) | F7 |
| Node chain identifier format | mapped from real identifiers in a unit test | live chain-id suite | F9 |
| Colour contrast | no | design-tokens gate (by role); real-browser gallery for these components is not set up | F14 |

---

## Section D — Deployment-readiness gates

### pre-localnet

- [x] account-bound executor; explicit chain; failed transactions surfaced; storage validated — F8
- [x] connect errors rendered; connect serialised — F3 (0.0.14; `components.test.ts`, `modal-real.test.ts`, `wallet.test.ts`)
- [x] no `v-html`; every dynamic `src` allowlisted (wallet icons, data-URI filter); no `VITE_*` — F8
- [x] strict type-check and lint green; no swallowed promises on a security path (the two empty catches are justified in comments) — measured 2026-10-09
- [x] no JSON-RPC; effects status checked — F8, SC-M3

### pre-testnet *(consumers are live on testnet)*

- [x] discovery not narrowed by other tools' requirements — F2 (0.0.14; `discovery.test.ts`)
- [x] the network guard named for what it checks; RPC chain identifier checked — F1, F9 (0.0.14/0.0.15; live chain-id suite PASS 2026-10-09)
- [x] unmocked component tests — F7 (`modal-real.test.ts`)
- [x] `npm pack` contents verified (10 files, `src` only); no lifecycle scripts; audit gate in CI and in the release — B.TS
- [x] shared-dependency matrix aligned with ADR-0001 — B.1
- [x] every test project that exists runs in CI — the hermetic suite does; the two integration suites are manual by the OPS lens (F7, ADJUDICATED)
- [x] real-chain harness runs recorded with date and result — C.1
- [x] release gate equals CI; provenance verified for 0.0.17 — B.2

### pre-mainnet

- [x] executors invalidated on a network switch — F1 (0.0.14)
- [x] the gRPC harness: manual by the OPS lens, runs recorded (replaces "scheduled in CI") — F7, C.1
- [x] duplicate-wallet warning — F4 (0.0.16)
- [ ] external review — maintainer item (`OPERATOR_TASKS.md` "Funding, grants and an external audit — after launch")
- [ ] mainnet chain-id constant confirmed against a mainnet run of a consuming app — mainnet item; the constant matches the live mainnet node today (chain-id suite), the first mainnet signing run is the end-to-end proof
- [x] optional hardenings S5 (harness chain-id guard), S6 (`Object.hasOwn`), S7 (components in the ui gallery) — recorded as ACCEPTED-RISK with reasons (F12–F14); not gating

---

## Cross-project themes

- **One signing boundary for the whole product.** Every app's VUE-M4 compliance depends on this
  adapter plus the wallet. The real network-mismatch block now lives here once (F1, F9) rather than in
  each app.
- **Shared-singleton side effects.** F2 was the shared-state analogue of eslint-config F3: one
  participant's configuration silently changed the others'. It is fixed by making requirements
  per caller; in the dashboard all tools share the singleton, so per-caller semantics matter.
- **Chain-identifier checks.** The same missing check appeared in sui-indexer F8 (`GRPC_URL` vs
  `NETWORK`). The format lesson (F9: a node reports the base58 genesis digest, the short id is its first
  four bytes) applies to both; a shared helper (`assertChainIdentifier(client, network)`) would serve
  both.
- **Stubs hide wire formats.** F9 was invisible to a mocked client and caught by a live read; the same
  lesson holds for every client package (verify external formats against the live service).
- **Pre-v0.2 policy:** behaviour changes ship without shims, as patch bumps (0.0.14–0.0.17 did); at
  go-live the workspace moves to 0.2.0.

---

## Normative requirements (MUST / MUST NOT)

1. MUST refuse to sign when the RPC's chain differs from the requested network, or MUST document
   precisely what is and isn't checked — **holds** (F1, F9). The wallet's active network is not readable by
   a dapp; the docs say what is checked.
2. MUST NOT let one consumer's configuration remove options from another consumer's view of the
   shared state — **holds** (F2).
3. MUST surface wallet connection errors to the user — **holds** (F3).
4. MUST bind executors to the account they were built for — holds (A6), and to the network (A12).
5. MUST NOT report a failed transaction as successful — holds (A8).

**SUI_CLIENT lens baseline:**

| ID | Holds? | Evidence |
| --- | --- | --- |
| SC-M1 / SC-M2 | N/A (no package IDs or type matching) | — |
| SC-M3 | yes (only effects success counts; finality is left to the caller's `waitForTransaction`, now documented — F5) | A8, A13 |
| SC-M4 | N/A | — |
| SC-M5 | yes (chain from `network`; RPC chain identifier checked for testnet and mainnet; network switch invalidates executors) | F1, F9 |
| SC-M6 / SC-M7 | N/A (no verification of signatures or events here) | — |
| SC-M8 | yes (no dry-run-only paths) | — |
| SC-M9 / SC-M10 | N/A (the adapter builds no PTBs) | — |

**VUE lens baseline:**

| ID | Holds? | Evidence |
| --- | --- | --- |
| VUE-M1 | yes (icons data-URI only; names as text) | F8 |
| VUE-M2 / VUE-M3 | N/A | — |
| VUE-M4 | yes for the adapter's part (the wallet shows the transaction; the RPC/network mismatch is blocked; the app shows action, amount and recipients in its own audit) | F1 |
| VUE-M5 | N/A | — |
| VUE-M6 | yes (account change, disconnect and network switch make executors refuse; consumers watch `account`) | F1, F8 |
| VUE-M7 | yes (network-scoped by design; tampered values ignored) | F8 |
| VUE-M8 | N/A (library) | — |
| VUE-M9 | yes (scoped styles; no global CSS, no hex colours) | F7 |

**TS lens baseline:** TS-M1 yes (`vue-tsc` strict, `noUncheckedIndexedAccess`); TS-M2 yes for what it
parses (the node's chain identifier is decoded and length-checked; wallet objects are structurally cast
and feature-guarded); TS-M3 N/A (no amounts); TS-M4 yes (the two empty catches are on non-security
paths and justified: the modal shows `error`, a rejecting disconnect still clears local state); TS-M5 N/A
(timeouts belong to the SDK and the gRPC transport); TS-M6 yes; TS-M7 yes (`files: ["src"]`, no
lifecycle scripts); TS-M8 yes (`npm ci`, audit gate with expiry, matrix aligned); TS-M9 yes (`@mysten/sui`,
`@mysten/wallet-standard` are peers; no `legacy-peer-deps`; types ship with the source).

**OPS lens baseline:** OPS-M1 N/A for CI (no scripted preflight; F12 for the harness); OPS-M2 N/A (no shell
scripts); OPS-M3 / M4 / M5 / M6 N/A (nothing irreversible, no IDs written); OPS-M7 yes (no key in CI, none
committed); OPS-M8 yes (no real-chain CI job; the suites are manual); OPS-M9 N/A (no CLI state).

## Implementation suggestions (SHOULD / MAY)

- **S1** (done, F1/F9) `assertRpcServesNetwork` reads the chain identifier once per client and compares
  the short id.
- **S2** (done, F1) `networkGeneration` is incremented by `setNetwork` / `setLocalnetRpc` and checked by
  executors.
- **S3** (done, F3) `error` is rendered in `WalletModal` with `role="alert"`; `WalletGuard` shows it
  through the modal.
- **S4** (done, F2) Per-caller filtered lists replace the global requirement set.
- **S5** MAY make the execution harness read the node's chain identifier and refuse a URL that does not
  match its network label before signing (reuse `shortChainId`) (F12).
- **S6** MAY look the chain-id table up with `Object.hasOwn` or a `Map` (F13).
- **S7** MAY add `WalletSelector` and `WalletModal` to the ui component gallery so the real-browser axe
  run covers them (F14).
- **S8** MAY clear `error` when the dialog opens, so a reopened picker does not show the last failure
  (F3 observation).

## Open questions (`OQ#`)

All three first-pass questions are answered; none remains open.

1. **OQ1 (answered, F1)** Wallet-standard gives a dapp no read of the wallet's active network, so the
   adapter does not claim to detect it. The chain-identifier check on `rpcUrl` was accepted (one read per
   network + URL, cached).
2. **OQ2 (answered, F2)** Wallets are never hidden from other tools; an operation on a wallet lacking its
   feature throws a clear error, and each tool decides whether to disable the action.
3. **OQ3 (answered, F5)** `signAndExecute` does not wait for indexing by default; the docs say so and
   `waitForTransaction` is exposed.

## Risks

- **Signing on the wrong network** relies on wallets honouring `chain` (F1); the adapter now also blocks a
  mismatched RPC and a network switch after the executor was built.
- **Shared state surprises** in the dashboard (F2) are removed for the wallet list; any new global
  setting on the singleton would reintroduce them, so new options should stay per caller.
- **Silent failures** in connect (F3) are fixed; a wallet-side failure still depends on the extension's
  own message.
- **Release path.** A wrong constant in a security check (F9) can ship because a mock agrees with it; the
  live chain-id suite is manual, so run it before any release that touches the chain check.

---

## Re-verification log

- 2026-10-03 — first-pass baseline at `be5b445` (release `v0.0.13` = `3f5e1aa`, npm 0.0.13 with
  provenance).
  - **Lenses:** AUDIT_TEMPLATE.md (2026-10-02) + VUE (2026-09-30) + SUI_CLIENT (2026-09-30) + TS
    (2026-10-03).
  - **Measured:** type-check, lint and the audit gate clean; 26/26 tests; coverage 81.4 / 68.9 /
    88.6 / 83.3; pack 10 files.
  - **Probes:** jsdom probes with real wallet-standard registration (deleted afterwards) confirmed
    F2, F3 and F4.
  - **Not run:** the integration harness (egress).
  - **Recorded:** F1–F8; OQ1–OQ3.
  - **No findings resolved:** by maintainer instruction this pass only records findings. Remediation,
    including single-solution fixes under the resolve-inline rule, is to be applied separately, with
    each disposition moved to RESOLVED and the diff cited.
- 2026-10-09 — re-verified against `main` `1a93f9c` (release `v0.0.17` = `0561d0b`, npm 0.0.17,
  provenance verified).
  - **Lenses:** AUDIT_TEMPLATE.md, VUE, SUI_CLIENT, TS, OPS (all registry dates 2026-10-08). OPS added
    (the real-chain integration harness); front-matter tables for SUI_CLIENT and OPS, the operations
    matrix and script inventory, the shared-dependency matrix, B.OPS-1 and the OPS baseline added; the
    cross-lens normative baselines refreshed.
  - **Resolved since the first pass:** F1, F2, F3 (0.0.14, `d654744`); F1's chain-id format defect
    (0.0.15, `cea73fb`, new F9); F4, F5, F6, F7 (0.0.16, `d2e8db5`, published as 0.0.17 `0561d0b`).
    CHANGELOG covers 0.0.16 and 0.0.17; 0.0.14 and 0.0.15 are in the git history only. F1 keeps one
    ACCEPTED-RISK residual (the wallet's active network); F7 keeps one ADJUDICATED sub-item (the gRPC
    harness stays manual); F6 keeps the small client cache as ACCEPTED-RISK.
  - **New findings:** F9 (chain-id format, RESOLVED), F10 (0.0.16 unpublished, RESOLVED), F11 (execution
    suite funding check, RESOLVED `4e49d0e`), F12 (harness URL vs label, ACCEPTED-RISK), F13 (`Object.hasOwn`
    on the chain-id table, ACCEPTED-RISK), F14 (contrast evidence by role, ACCEPTED-RISK).
  - **Measured:** type-check, lint and the audit gate clean; 41/41 tests in 5 files; coverage 91.58 /
    84.49 / 95.45 / 93.98; pack 10 files (12.1 kB packed, 34.7 kB unpacked); `npm audit --omit=dev` 0;
    `npm view` shows `latest` 0.0.17 with SLSA v1 provenance.
  - **Live runs:** chain-id suite (read-only) PASS against the testnet and mainnet nodes; execution suite
    PASS on testnet (maintainer run, after the faucet-address-balance test fix).
  - **Updated facts:** versions (0.0.13 → 0.0.17), locked deps (`@mysten/sui` 2.34.0, wallet-standard
    0.21.32, ui 0.1.31), peer ranges, line references, Node 24, source and test counts, Section A–D.
  - **Not verified:** the execution suite was not re-run in this pass (it signs and needs a funded key);
    behaviour against specific wallet extensions (not testable headless).

## Pre-save consistency checklist (this pass)

- [x] Section A ↔ findings: A7, A9, A10 now HOLD (F1–F3 RESOLVED); A11–A14 added for F1/F4/F5/F9.
- [x] Finding header ↔ body: dispositions updated with an evidence paragraph each.
- [x] Template line: base + VUE + SUI_CLIENT + TS + OPS with registry dates; untriggered lenses named.
- [x] Closing four-part structure present (normative, suggestions, open questions, risks).
- [x] Section D ↔ dispositions (unticked: external review and the first mainnet signing run only).
- [x] Executive summary ↔ dispositions and ceiling (High; realised Low).
- [x] C.1 counts measured 2026-10-09.
- [x] Re-verification log entry added; `check-audit-structure.mjs` run.
