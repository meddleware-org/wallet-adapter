// A tool's wallet, in one call. Every Meddleware tool (access gate, walrus, sealed storage, token issuance, treasury) used to carry its own
// `wallet.ts`: ~30 lines binding the shared singleton to the selected network and picking which features it needs. They differed only in the
// feature list and in which of the results they re-exported, so the binding lives here and a tool declares only what it needs:
//
//   // src/wallet.ts
//   import { createToolWallet } from '@meddleware/wallet-adapter'
//   export const { useWallet, getSuiClient, buildExecutor, signAndExecute } = createToolWallet({ requiredFeatures: ['sui:signTransaction'] })
//
// The wallet connection and the network selection stay module singletons shared by every tool in the window: a tool built with
// `createToolWallet` still sees the connection another tool made, and a network switch propagates to all of them.
import type { Transaction } from '@mysten/sui/transactions'
import type { SuiGrpcClient } from '@mysten/sui/grpc'
import { buildExecutor, getSuiClient, useWallet, type Executor } from './wallet.js'
import { useNetwork } from './network.js'

export interface ToolWalletOptions {
  /**
   * Wallet-standard features this tool needs, e.g. `sui:signTransaction` or `sui:signPersonalMessage`. They filter THIS tool's list of
   * wallets (a wallet missing one is not offered); another tool still sees every connectable wallet.
   */
  requiredFeatures?: string[]
}

/** What `useWallet()` returns for a tool. Everything a tool might use; destructure the parts it needs. */
export interface ToolWallet {
  wallets: ReturnType<typeof useWallet>['wallets']
  currentWallet: ReturnType<typeof useWallet>['currentWallet']
  account: ReturnType<typeof useWallet>['account']
  connecting: ReturnType<typeof useWallet>['connecting']
  error: ReturnType<typeof useWallet>['error']
  connect: ReturnType<typeof useWallet>['connect']
  disconnect: ReturnType<typeof useWallet>['disconnect']
  /** Sign a personal message with the connected wallet (for example to mint a Seal session key). */
  signPersonalMessage: ReturnType<typeof useWallet>['signPersonalMessage']
  /** Sign and execute a PTB with the connected wallet on the selected network; resolves with the digest, throws on an on-chain failure. */
  signAndExecute: (tx: Transaction) => Promise<{ digest: string }>
  /** The memoised gRPC client for the selected network. */
  getSuiClient: () => SuiGrpcClient
  /** An executor bound to the connected wallet and the selected network. */
  buildExecutor: () => Promise<Executor>
}

/** Bind the shared wallet and network singletons to one tool. See the file comment. */
export function createToolWallet(options: ToolWalletOptions = {}) {
  const { network, rpcUrl } = useNetwork()

  /** The memoised gRPC client for the network selected right now (read at call time, so a switch is followed). */
  const client = (): SuiGrpcClient => getSuiClient(network.value, rpcUrl.value)
  /** An executor bound to the connected wallet and the network selected right now. */
  const executor = (): Promise<Executor> => buildExecutor(network.value, rpcUrl.value)
  const signAndExecute = async (tx: Transaction): Promise<{ digest: string }> => (await executor()).signAndExecute(tx)
  const signPersonalMessage: ToolWallet['signPersonalMessage'] = (message) => useWallet().signPersonalMessage(message)

  function useToolWallet(): ToolWallet {
    const base = useWallet({ requiredFeatures: options.requiredFeatures })
    return {
      wallets: base.wallets,
      currentWallet: base.currentWallet,
      account: base.account,
      connecting: base.connecting,
      error: base.error,
      connect: base.connect,
      disconnect: base.disconnect,
      signPersonalMessage,
      signAndExecute,
      getSuiClient: client,
      buildExecutor: executor,
    }
  }

  return { useWallet: useToolWallet, getSuiClient: client, buildExecutor: executor, signAndExecute, signPersonalMessage }
}
