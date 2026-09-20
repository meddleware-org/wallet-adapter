# Security Policy

## Scope

This policy covers security issues in the `@meddleware/wallet-adapter` package source (`src/**`) —
the shared wallet singleton, connect/disconnect, `signPersonalMessage`, `buildExecutor`,
`getSuiClient`, and network selection.

It does not cover:

- `@mysten/sui` / `@mysten/wallet-standard` or any wallet extension (report upstream)
- The caller-supplied `rpcUrl` / network endpoint (the adapter validates, but does not resolve or
  own, endpoints)
- A consuming application's decision about which tool views it mounts in a shared window (see the
  trust assumption below)

## Security model (invariants)

These invariants are load-bearing. A report demonstrating that any is violated is in scope and
treated as high severity:

1. **First-party, same-origin, same-bundle singleton.** `useWallet()` is a module singleton: every
   tool view mounted in one browser window shares one connection, account, and signing surface.
   This is safe **only** because all co-mounted tool views are first-party and ship in one trusted
   bundle. Do **not** embed untrusted or third-party tool views (iframes, remote modules) into a
   window that shares this singleton.
2. **The adapter never mutates or injects into transactions.** A caller-built transaction is passed
   straight to the wallet's `signTransaction`; the wallet confirms every signature and every
   transaction independently.
3. **No secrets, accounts, or signatures are logged or persisted.** `localStorage` holds only the
   selected network name and an optional localnet RPC URL — never an account or signature.
4. **Signing operations fail closed.** Each operation throws if the wallet lacks the required
   feature or no wallet is connected.
5. **gRPC only.** The client is `SuiGrpcClient`; JSON-RPC is not used. `rpcUrl` must be a trusted
   gRPC-web endpoint.

## Supported versions

Only the latest published npm version receives security fixes.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report vulnerabilities by emailing **<security@meddleware.co.uk>**. Include:

- A description of the vulnerability and its impact
- Steps to reproduce or a proof-of-concept (if available)
- The package version or commit SHA you tested against

You will receive an acknowledgement within **3 business days** and a resolution plan within
**14 days** for confirmed issues. Critical issues (CVSS ≥ 9.0) are prioritised for same-day
acknowledgement.

## Disclosure

Once a fix is released, a security advisory will be published on the GitHub repository. Reporters
may be credited by name unless they prefer to remain anonymous.
