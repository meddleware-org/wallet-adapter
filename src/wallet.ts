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
// they are intentionally thin and execute via gRPC (SuiGrpcClient). Feature availability
// is guarded at call time, so a wallet missing an optional feature fails that specific
// operation rather than being excluded from discovery.
import { computed, markRaw, readonly, ref, shallowRef } from 'vue'
import type { DeepReadonly, Ref } from 'vue'
import { getWallets, isWalletWithRequiredFeatureSet } from '@mysten/wallet-standard'
import type { Wallet, WalletAccount } from '@mysten/wallet-standard'
import { SuiGrpcClient } from '@mysten/sui/grpc'
import { fromBase64 } from '@mysten/sui/utils'
import type { Transaction } from '@mysten/sui/transactions'
import type { SuiClientTypes } from '@mysten/sui/client'
import { networkGeneration } from './network.js'

/** Sui networks the gRPC client accepts as a label. */
type SuiNetwork = 'mainnet' | 'testnet' | 'devnet' | 'localnet'

/** Allow https:// and http://localhost / http://127.0.0.1 for local dev. */
function isAllowedGrpcUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1'
  } catch { return false }
}

// ── singleton reactive state ────────────────────────────────────────────────────────────
const wallets = shallowRef<Wallet[]>([])
const currentWallet = shallowRef<Wallet | null>(null)
const account = shallowRef<WalletAccount | null>(null)
const connecting = ref(false)
const error = ref<string | null>(null)

// Discovery lists every wallet that can connect (`standard:connect`). A tool that needs more
// (say `sui:signPersonalMessage`) asks `useWallet({ requiredFeatures })` for its OWN filtered list;
// it never narrows what another tool sees, and every operation is also feature-guarded at call time.
const BASELINE = ['standard:connect']

// ── Sui client cache (keyed by network + url so a URL change is not silently ignored) ─────
// gRPC client (JSON-RPC is deprecated SDK-wide). `rpcUrl` is a gRPC-web endpoint, e.g.
// https://fullnode.testnet.sui.io:443 — the default GrpcWebFetchTransport works in the browser.
const clients = new Map<string, SuiGrpcClient>()
/** Return a memoised {@link SuiGrpcClient} for the network + gRPC-web URL (one instance each). */
export function getSuiClient(network: string, rpcUrl: string): SuiGrpcClient {
  if (!isAllowedGrpcUrl(rpcUrl)) {
    throw new Error(
      `getSuiClient: rpcUrl must use https:// (or http://localhost / http://127.0.0.1 for local dev). Got: ${rpcUrl}`,
    )
  }
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
    .filter((w) => isWalletWithRequiredFeatureSet(w, BASELINE))
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

// Unsubscribe handle for the connected wallet's `standard:events` change listener.
let stopWalletEvents: (() => void) | null = null

type ChangeListener = (props: { accounts?: readonly WalletAccount[] }) => void

/**
 * Follow account switches made inside the wallet (wallet-standard `standard:events` → `change`):
 * keep the current account while the wallet still exposes it, otherwise move to the wallet's first
 * account, and drop the connection when the wallet reports no accounts (disconnected or locked).
 * Consumers observe this through the reactive `account` ref.
 */
function subscribeToWalletEvents(wallet: Wallet): void {
  stopWalletEvents?.()
  stopWalletEvents = null
  const events = wallet.features['standard:events'] as
    | { on: (event: 'change', listener: ChangeListener) => () => void }
    | undefined
  if (!events) return
  stopWalletEvents = events.on('change', ({ accounts }) => {
    if (!accounts || currentWallet.value !== wallet) return
    const first = accounts[0]
    if (!first) {
      clearConnection()
      return
    }
    const current = account.value
    const same = current && accounts.find((a) => a.address === current.address)
    account.value = markRaw(same ?? first)
  })
}

function clearConnection(): void {
  stopWalletEvents?.()
  stopWalletEvents = null
  currentWallet.value = null
  account.value = null
}

async function connect(wallet: Wallet): Promise<void> {
  // One connection attempt at a time: a double click or a second wallet clicked mid-prompt is ignored
  // instead of racing (the last to resolve would win, and the other's event listener be dropped).
  if (connecting.value) return
  error.value = null
  connecting.value = true
  try {
    const feature = wallet.features['standard:connect'] as {
      connect: () => Promise<{ accounts: readonly WalletAccount[] }>
    }
    const { accounts } = await feature.connect()
    const first = accounts[0]
    if (!first) throw new Error('Wallet returned no accounts.')
    currentWallet.value = markRaw(wallet)
    account.value = markRaw(first)
    subscribeToWalletEvents(wallet)
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
  // A wallet that rejects its own disconnect must not become an unhandled rejection; local state
  // is cleared regardless.
  void Promise.resolve(disc?.disconnect?.()).catch(() => {})
  clearConnection()
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

/**
 * Structural shape of a `client.executeTransaction` result: a discriminated union where
 * `Transaction` is a successful execution and `FailedTransaction` is a submitted tx that failed
 * on-chain (abort, insufficient gas, etc.). The real SDK type satisfies this subset.
 */
export interface ExecuteTransactionLike {
  $kind: string
  Transaction?: { digest: string }
  FailedTransaction?: { digest: string }
}

/**
 * Extract the digest from an execute result, THROWING on `FailedTransaction`. Without this a caller
 * would treat an on-chain failure as success (both branches carry a digest), so failed submissions
 * must be surfaced, not swallowed.
 */
export function digestFromExecuteResult(res: ExecuteTransactionLike): { digest: string } {
  if (res.$kind === 'FailedTransaction') {
    throw new Error(
      `Transaction ${res.FailedTransaction?.digest ?? '(unknown)'} failed on-chain (aborted or rejected during execution).`,
    )
  }
  if (!res.Transaction) {
    throw new Error(`unexpected execution result kind: ${res.$kind}`)
  }
  return { digest: res.Transaction.digest }
}

/** Which execution details to return (`effects`, `objectTypes`, `balanceChanges`, `events`, …). */
export type TransactionInclude = SuiClientTypes.TransactionInclude

/**
 * The detailed result of {@link Executor.signAndExecute} with `include`. Unlike the plain form it
 * does **not** throw when the transaction failed on-chain — a failed transaction still has effects
 * (gas used, the abort) — so callers MUST check `success` before treating it as done.
 */
export interface ExecutedTransaction<Include extends TransactionInclude> {
  digest: string
  /** `true` only when the effects status is success. */
  success: boolean
  /** The SDK result: `Transaction` on success, `FailedTransaction` when it aborted on-chain. */
  result: SuiClientTypes.TransactionResult<Include>
}

/** Transaction executor bound to the connected wallet: sign+execute a PTB and await finality. */
export interface Executor {
  /** The connected account address the executor signs with. */
  address: string
  /** Sign and execute; resolves with the digest, and THROWS if the transaction failed on-chain. */
  signAndExecute(tx: Transaction): Promise<{ digest: string }>
  /** Sign and execute, returning the requested execution details (see {@link ExecutedTransaction}). */
  signAndExecute<Include extends TransactionInclude>(
    tx: Transaction,
    opts: { include: Include },
  ): Promise<ExecutedTransaction<Include>>
  waitForTransaction(digest: string): Promise<unknown>
}

/**
 * Refuse to sign for a chain the account cannot sign for. Wallet-standard accounts list the chains
 * they SUPPORT (`sui:mainnet`, `sui:testnet`, …), and most Sui wallets list all of them, so this
 * catches an unsupported chain, not the network the wallet UI happens to be set to. The binding that
 * matters is the explicit `chain` passed to `signTransaction`; the RPC's chain id is checked
 * separately ({@link assertRpcServesNetwork}).
 */
function assertAccountOnChain(acct: WalletAccount, chain: `sui:${string}`): void {
  if (!acct.chains.includes(chain)) {
    const listed = acct.chains.length ? acct.chains.join(', ') : 'none'
    throw new Error(`The connected wallet account cannot sign for ${chain} (it lists: ${listed}).`)
  }
}

/** First four bytes (hex) of the genesis digest: the chain identifier public nodes report. */
const KNOWN_CHAIN_IDS: Readonly<Record<string, string>> = { testnet: '4c78adac', mainnet: '35834a8a' }
const verifiedRpcs = new Set<string>()

/**
 * Refuse an RPC that does not serve `network`. Signing bytes for one chain and submitting them to
 * another's node fails confusingly at best; reading the chain identifier once (cached per
 * network + URL) and comparing it with the known id catches a mismatched pair up front. Only
 * `testnet` and `mainnet` have a fixed id; other networks are not checked.
 */
async function assertRpcServesNetwork(client: unknown, network: string, rpcUrl: string): Promise<void> {
  const want = KNOWN_CHAIN_IDS[network]
  const key = `${network}|${rpcUrl}`
  if (!want || verifiedRpcs.has(key)) return
  const core = (client as { core?: { getChainIdentifier?: () => Promise<{ chainIdentifier: string }> } }).core
  if (!core?.getChainIdentifier) return // an injected client without the call: nothing to check
  const { chainIdentifier } = await core.getChainIdentifier()
  if (chainIdentifier !== want) {
    throw new Error(`The RPC at ${rpcUrl} serves chain ${chainIdentifier}, not ${network} (${want}). Check the network and RPC URL.`)
  }
  verifiedRpcs.add(key)
}

/** The client calls an executor makes: the gRPC core API's execute + wait. */
export type ExecutionClient = Pick<SuiGrpcClient, 'executeTransaction' | 'waitForTransaction'>

/** Options for {@link buildExecutor}. */
export interface BuildExecutorOptions {
  /**
   * Execute through this client instead of the shared one for `network` / `rpcUrl` — for an app
   * with its own client (e.g. a test build that stubs the network). Signing, the chain check and
   * the account binding are unchanged.
   */
  client?: ExecutionClient
}

/** Build an executor bound to the connected wallet + network/RPC URL. */
export async function buildExecutor(network: string, rpcUrl: string, options: BuildExecutorOptions = {}): Promise<Executor> {
  const wallet = currentWallet.value
  const acct = account.value
  if (!wallet || !acct) throw new Error('Connect a wallet first.')
  const client: ExecutionClient = options.client ?? getSuiClient(network, rpcUrl)
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
  assertAccountOnChain(acct, chain)
  await assertRpcServesNetwork(client, network, rpcUrl)
  const builtInGeneration = networkGeneration()

  // Narrowed once here: function declarations do not inherit the checks above.
  const boundAccount: WalletAccount = acct
  const signer = signFeature

  async function signAndExecute(tx: Transaction): Promise<{ digest: string }>
  async function signAndExecute<Include extends TransactionInclude>(
    tx: Transaction,
    opts: { include: Include },
  ): Promise<ExecutedTransaction<Include>>
  async function signAndExecute<Include extends TransactionInclude>(
    tx: Transaction,
    opts?: { include: Include },
  ): Promise<{ digest: string } | ExecutedTransaction<Include>> {
    // The executor is bound to one account: refuse to sign after a disconnect or an account
    // switch rather than signing (or presenting) a transaction built for another sender.
    if (currentWallet.value !== wallet || account.value?.address !== boundAccount.address) {
      throw new Error('The connected wallet account changed; rebuild the transaction and try again.')
    }
    // Likewise for the selected network: this executor signs for, and submits to, the one it was built for.
    if (networkGeneration() !== builtInGeneration) {
      throw new Error('The selected network changed; rebuild the transaction and try again.')
    }
    const { bytes, signature } = await signer.signTransaction({
      transaction: tx,
      account: boundAccount,
      chain,
    })
    // gRPC core execution: the signed transaction bytes (base64 from the wallet) + signatures.
    if (!opts) {
      const res = await client.executeTransaction({
        transaction: fromBase64(bytes),
        signatures: [signature],
      })
      return digestFromExecuteResult(res)
    }
    const result = (await client.executeTransaction({
      transaction: fromBase64(bytes),
      signatures: [signature],
      include: opts.include,
    })) as SuiClientTypes.TransactionResult<Include>
    const executed = result.$kind === 'Transaction' ? result.Transaction : result.FailedTransaction
    return { digest: executed.digest, success: result.$kind === 'Transaction' && executed.status.success, result }
  }

  return {
    address: acct.address,
    signAndExecute,
    async waitForTransaction(digest: string): Promise<unknown> {
      return client.waitForTransaction({ digest })
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
   * Wallet-standard features this consumer needs. Applied to THIS caller's `wallets` list only
   * (default: just `standard:connect`); other callers still see every connectable wallet.
   * Individual operations are additionally feature-guarded at call time.
   */
  requiredFeatures?: string[]
}

/**
 * Wallet composable: discovers wallets, exposes reactive connection state, and provides
 * `connect` / `disconnect` / `signPersonalMessage` / `buildExecutor` / `getSuiClient`.
 *
 * Module singleton — every caller shares one wallet/account state. Passing `requiredFeatures`
 * filters this caller's `wallets` list; it never changes what another caller sees.
 */
export function useWallet(options?: UseWalletOptions) {
  init()
  const needed = [...new Set([...BASELINE, ...(options?.requiredFeatures ?? [])])]
  const visible = needed.length === BASELINE.length
    ? readonly(wallets)
    : readonly(computed(() => wallets.value.filter((w) => isWalletWithRequiredFeatureSet(w, needed))))
  return {
    wallets: visible,
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
