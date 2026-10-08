# Changelog

All notable changes to `@meddleware/wallet-adapter` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

## [0.0.16] - 2026-10-08

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
