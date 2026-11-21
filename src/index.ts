// @meddleware/wallet-adapter — shared Sui wallet-standard adapter for Meddleware Vue 3 apps.
//
// A module-singleton composable so multiple tool views rendered in one window share a single
// wallet connection. Network-agnostic: callers pass their resolved RPC URL. Wallet-agnostic:
// works with any wallet-standard extension.
//
// This file only re-exports. The wallet (`wallet.ts`), the tool binding (`tool-wallet.ts`), the network selector (`network.ts`) and the three
// components; the test doubles are deliberately NOT here: they live in `testing.ts`, a separate entry (`@meddleware/wallet-adapter/testing`) that an
// app imports only from its end-to-end build.

export { useWallet, getSuiClient, buildExecutor } from './wallet.js'
export { createToolWallet } from './tool-wallet.js'
export type { ToolWallet, ToolWalletOptions } from './tool-wallet.js'
export type {
  Executor,
  ExecutedTransaction,
  ExecutionClient,
  BuildExecutorOptions,
  TransactionInclude,
  WalletState,
  UseWalletOptions,
} from './wallet.js'

export { useNetwork, rpcUrlFor, selectBuiltNetwork, isAllowedRpcOverride, MW_NETWORKS } from './network.js'
export type { MwNetwork } from './network.js'

export { default as WalletSelector } from './WalletSelector.vue'
export { default as WalletGuard } from './WalletGuard.vue'
export { default as WalletModal } from './WalletModal.vue'
