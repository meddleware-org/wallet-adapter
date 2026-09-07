// Shared Sui wallet adapter on @mysten/wallet-standard (dapp-kit is React-only).
// Discovers wallets, connects, signs personal messages, and adapts the connected wallet
// into a transaction executor.
//
// MODULE SINGLETON — all callers across all imported tool views share one wallet/account
// state. This is the whole point: when several tool components are rendered inline in one
// window (e.g. the dashboard), the user connects once and every tool sees the connection.
//
// NETWORK-AGNOSTIC — the RPC URL is passed by the caller (each app resolves its own from
// env). The chain id is derived as `sui:<network>`.
//
// NOTE: the signing paths can only be exercised with a real wallet extension in a browser;
// they are intentionally thin and execute via a JSON-RPC client so we control the returned
// effects. Feature availability is guarded at call time, so a wallet missing an optional
// feature fails that specific operation rather than being excluded from discovery.
import { markRaw, readonly, ref, shallowRef } from 'vue'
import type { DeepReadonly, Ref } from 'vue'
import { getWallets, isWalletWithRequiredFeatureSet } from '@mysten/wallet-standard'
import type { Wallet, WalletAccount } from '@mysten/wallet-standard'
import { SuiGrpcClient } from '@mysten/sui/grpc'
import { fromBase64 } from '@mysten/sui/utils'
import type { Transaction } from '@mysten/sui/transactions'

/** Sui networks the gRPC client accepts as a label. */
type SuiNetwork = 'mainnet' | 'testnet' | 'devnet' | 'localnet'

// ── singleton reactive state ────────────────────────────────────────────────────────────
const wallets = shallowRef<Wallet[]>([])
const currentWallet = shallowRef<Wallet | null>(null)
const account = shallowRef<WalletAccount | null>(null)
const connecting = ref(false)
const error = ref<string | null>(null)

// Wallet discovery is filtered on the UNION of features requested by every `useWallet`
// caller. A wallet passing the union filter can serve every tool sharing the singleton.
// `standard:connect` is the baseline (a wallet that cannot connect is useless).
const requiredFeatures = new Set<string>(['standard:connect'])

// ── Sui client cache (keyed by network + url so a URL change is not silently ignored) ─────
// gRPC client (JSON-RPC is deprecated SDK-wide). `rpcUrl` is a gRPC-web endpoint, e.g.
// https://fullnode.testnet.sui.io:443 — the default GrpcWebFetchTransport works in the browser.
const clients = new Map<string, SuiGrpcClient>()
/** Return a memoised {@link SuiGrpcClient} for the network + gRPC-web URL (one instance each). */
export function getSuiClient(network: string, rpcUrl: string): SuiGrpcClient {
  const key = `${network}|${rpcUrl}`
  let c = clients.get(key)
  if (!c) {
    c = new SuiGrpcClient({ network: network as SuiNetwork, baseUrl: rpcUrl })
    clients.set(key, c)
  }
  return c
}

function refreshWallets(): void {
  // markRaw: extension Wallet objects expose name/icon as ES-private-field getters that
  // throw when accessed through a Vue reactive Proxy.
  wallets.value = getWallets()
    .get()
    .filter((w) => isWalletWithRequiredFeatureSet(w, [...requiredFeatures]))
    .map((w) => markRaw(w))
}

let initialised = false
function init(): void {
  if (initialised) return
  initialised = true
  const api = getWallets()
  refreshWallets()
  api.on('register', refreshWallets)
  api.on('unregister', refreshWallets)
}

async function connect(wallet: Wallet): Promise<void> {
  error.value = null
  connecting.value = true
  try {
    const feature = wallet.features['standard:connect'] as {
      connect: () => Promise<{ accounts: readonly WalletAccount[] }>
    }
    const { accounts } = await feature.connect()
    if (!accounts.length) throw new Error('Wallet returned no accounts.')
    currentWallet.value = markRaw(wallet)
    account.value = markRaw(accounts[0])
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    throw e
  } finally {
    connecting.value = false
  }
}

function disconnect(): void {
  const disc = currentWallet.value?.features['standard:disconnect'] as
    | { disconnect?: () => Promise<void> }
    | undefined
  void disc?.disconnect?.()
  currentWallet.value = null
  account.value = null
}

/** Sign a personal message with the connected wallet; returns the base64 signature. */
async function signPersonalMessage(message: Uint8Array): Promise<{ signature: string }> {
  const wallet = currentWallet.value
  const acct = account.value
  if (!wallet || !acct) throw new Error('Connect a wallet first.')
  const feature = wallet.features['sui:signPersonalMessage'] as
    | {
        signPersonalMessage: (input: {
          message: Uint8Array
          account: WalletAccount
        }) => Promise<{ bytes: string; signature: string }>
      }
    | undefined
  if (!feature) throw new Error('This wallet cannot sign personal messages.')
  const { signature } = await feature.signPersonalMessage({ message, account: acct })
  return { signature }
}

/** Transaction executor bound to the connected wallet: sign+execute a PTB and await finality. */
export interface Executor {
  /** The connected account address the executor signs with. */
  address: string
  signAndExecute(tx: Transaction): Promise<{ digest: string }>
  waitForTransaction(digest: string): Promise<unknown>
}

/** Build an executor bound to the connected wallet + network/RPC URL. */
export async function buildExecutor(network: string, rpcUrl: string): Promise<Executor> {
  const wallet = currentWallet.value
  const acct = account.value
  if (!wallet || !acct) throw new Error('Connect a wallet first.')
  const client = getSuiClient(network, rpcUrl)
  const chain = `sui:${network}` as const

  const signFeature = wallet.features['sui:signTransaction'] as
    | {
        signTransaction: (input: {
          transaction: Transaction
          account: WalletAccount
          chain: `sui:${string}`
        }) => Promise<{ bytes: string; signature: string }>
      }
    | undefined
  if (!signFeature) throw new Error('This wallet cannot sign transactions.')

  return {
    address: acct.address,
    async signAndExecute(tx: Transaction): Promise<{ digest: string }> {
      const { bytes, signature } = await signFeature.signTransaction({
        transaction: tx,
        account: acct,
        chain,
      })
      // gRPC core execution: the signed transaction bytes (base64 from the wallet) + signatures.
      // The result is a discriminated union — a successfully-submitted tx (even one that aborts
      // on-chain) carries its digest under Transaction/FailedTransaction.
      const res = await client.core.executeTransaction({
        transaction: fromBase64(bytes),
        signatures: [signature],
      })
      const executed = res.$kind === 'Transaction' ? res.Transaction : res.FailedTransaction
      return { digest: executed.digest }
    },
    async waitForTransaction(digest: string): Promise<unknown> {
      return client.core.waitForTransaction({ digest })
    },
  }
}

/** Reactive connection state exposed by {@link useWallet} (all fields readonly). */
export interface WalletState {
  wallets: DeepReadonly<Ref<Wallet[]>>
  currentWallet: DeepReadonly<Ref<Wallet | null>>
  account: DeepReadonly<Ref<WalletAccount | null>>
  connecting: Readonly<Ref<boolean>>
  error: Readonly<Ref<string | null>>
}

/** Options for {@link useWallet}. */
export interface UseWalletOptions {
  /**
   * Wallet-standard features this consumer needs. Merged into the singleton's discovery
   * filter (union across all callers). Defaults to just `standard:connect`; individual
   * operations are additionally feature-guarded at call time.
   */
  requiredFeatures?: string[]
}

/**
 * Wallet composable: discovers wallets, exposes reactive connection state, and provides
 * `connect` / `disconnect` / `signPersonalMessage` / `buildExecutor` / `getSuiClient`.
 *
 * Module singleton — every caller shares one wallet/account state. Passing `requiredFeatures`
 * widens the discovery filter (union); it never narrows another caller's view.
 */
export function useWallet(options?: UseWalletOptions) {
  if (options?.requiredFeatures?.length) {
    let changed = false
    for (const f of options.requiredFeatures) {
      if (!requiredFeatures.has(f)) {
        requiredFeatures.add(f)
        changed = true
      }
    }
    if (initialised && changed) refreshWallets()
  }
  init()
  return {
    wallets: readonly(wallets),
    currentWallet: readonly(currentWallet),
    account: readonly(account),
    connecting: readonly(connecting),
    error: readonly(error),
    connect,
    disconnect,
    signPersonalMessage,
    getSuiClient,
    buildExecutor,
  }
}
