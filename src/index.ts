// @meddleware/wallet-adapter — shared Sui wallet-standard adapter for Meddleware Vue 3 apps.
//
// A module-singleton composable so multiple tool views rendered in one window share a single
// wallet connection. Network-agnostic: callers pass their resolved RPC URL. Wallet-agnostic:
// works with any wallet-standard extension.

export { useWallet, getSuiClient, buildExecutor } from './wallet.js'
export type { Executor, WalletState, UseWalletOptions } from './wallet.js'

export { default as WalletSelector } from './WalletSelector.vue'
export { default as WalletGuard } from './WalletGuard.vue'
