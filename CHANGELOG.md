# Changelog

All notable changes to `@meddleware/wallet-adapter` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.0.26] - 2026-11-27

- The errors for a refused or mismatched full-node address no longer repeat the address (it can carry an API key); they name the origin only.

### Changed

- Documentation: every file is annotated line by line and has a header; added `CONTRIBUTING.md` and `AGENTS.md`; the README has a Development section and CLAUDE.md has Commands, Gotchas and Related.
- CI runs the shared dependency gate (`npx --no-install mw-audit-gate`, from `@meddleware/frontend-config`) instead of a copy in `.github/audit-gate.mjs`, which is removed.
- No behaviour change: the compiled output of the source is identical.

## [0.0.25] - 2026-11-19

### Changed

- **The selected network is kept for the tab, not the device (PECR Sch. A1 para 4(e)).** `useNetwork` keeps the network and the
  localnet RPC in `sessionStorage` instead of `localStorage`; the old `localStorage` keys are removed on load. A link may carry
  `?network=testnet|mainnet|localnet` to open on that network (read once at load; an unknown value is ignored).
- `setNetwork(n, { keep: false })` selects without storing, for a selection the app makes on the person's behalf (an instance's
  network); `selectBuiltNetwork` stores nothing either.

## [0.0.24] - 2026-11-19

### Added

- `useNetwork().setRpcUrl(network, url | null)`: an operator's full node for testnet or mainnet instead of the public one
  (https only, no credentials, query or fragment; `isAllowedRpcOverride` is exported). It is kept for the page, never
  stored, so a visitor cannot set one; a change on the selected network starts a new network generation, and the wallet
  still checks the node serves the network's chain before signing.

## [0.0.23] - 2026-11-12

### Changed

- Takes `@meddleware/web-utils` ^0.0.4 and `@meddleware/ui` ^0.1.42 (an app installs one copy of each).

## [0.0.22] - 2026-11-07

### Added

- `useNetwork().explorerNetwork` (the network as block-explorer links know it) and `selectBuiltNetwork(built)` (a standalone build selects its `VITE_NETWORK`), so the tool apps stop carrying their own copies.

## [0.0.21] - 2026-11-01

### Changed

- `setSuiClientOverride` is exported from `@meddleware/wallet-adapter/testing` only, no longer from the production entry (it is a test and end-to-end hook; no app used it from `.`).

## [0.0.20] - 2026-10-31

- Tool wallet factory, testing entry, components rebuilt from ui

## [0.0.19] - 2026-10-30

- Patch the new advisories and drop the stale allowlist entry. No API change.

## [0.0.18] - 2026-10-24

### Changed

- Documentation and comments use the renamed package and service names (workspace naming convention, `docs/architecture/ADR-0003-naming.md`). No code change. `@types/node` ~26.6.5 (development only).

## [0.0.17] - 2026-10-08

### Fixed

- The publish job ran a `build` script this source-shipping package does not have (0.0.16 never published); it publishes the changes below.

## [0.0.16] - 2026-10-08 (not published)

### Fixed

- The picker warns when two registered wallets share a name (any extension can register any name and icon) and
  keys them by position, so look-alikes are distinct entries.
- One local-URL rule: `http://localhost` / `http://127.0.0.1` only (`getSuiClient` accepted any scheme on
  localhost, e.g. `ws://`); `getSuiClient` refuses an unknown network label and `setNetwork` an unknown network
  name instead of storing it.
- `Executor` documentation no longer promises finality: `signAndExecute` returns once the node has the
  transaction; call `waitForTransaction(digest)` before dependent reads.
- No hard-coded colour fallbacks in the components (`var(--accent, #6366f1)` …).

### Changed

- Peer ranges: `@mysten/wallet-standard` `>=0.21 <0.22` (0.x minors are breaking), `@meddleware/ui` ^0.1.31.
- CI runs lint without `--if-present`; the tag workflow runs the same workflow as CI (lint was missing).
- Tests: the real modal → connect → rejection path with the real wallet module and registered fake wallets,
  the look-alike picker, and `WalletGuard` (it was at 0%).

Earlier releases are described in the git history.
