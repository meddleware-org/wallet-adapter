# Open standards and interoperability: wallet-adapter

The shared Sui wallet connection.

This page lists what the project speaks today, what is planned, what was considered and does not apply, where someone else can extend it, and what proves each claim. The platform-wide list is [Standards we use](https://meddleware.dev/platform/standards). A row appears there in the same change that turns a standard on.

## Spoken today

- Wallet Standard (connects any compatible wallet, through @meddleware/wallet-adapter)
- The network is carried in the address, not stored

## Planned

- none

## Considered, not applicable

- Non-Sui wallets: added when a tool for another chain exists (the platform is not tied to one chain)

## Extension points

- Any Wallet Standard wallet appears without code changes

## What proves it

- its unit tests
- the apps' mock wallet in e2e

_Maintained centrally with the platform's interoperability map; changes go through it so every repository says the same thing._
