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
import { fromBase58, fromBase64 } from '@mysten/sui/utils'
import type { Transaction } from '@mysten/sui/transactions'
import type { SuiClientTypes } from '@mysten/sui/client'
import { isLocalUrl, networkGeneration } from './network.js'

/** Sui networks the gRPC client accepts as a label. */
type SuiNetwork = 'mainnet' | 'testnet' | 'devnet' | 'localnet'

/** Networks the gRPC client accepts as a label (what `getSuiClient` may be asked for). */
const GRPC_NETWORKS = ['mainnet', 'testnet', 'devnet', 'localnet']

/**
 * Allow https:// and http://localhost / http://127.0.0.1 for local dev (the same local rule as `network.ts`).
 * @param url - the gRPC-web endpoint a caller asked for
 * @returns whether the wallet may talk to it
 */
function isAllowedGrpcUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:' || isLocalUrl(url)
  } catch { return false }
}

// ── singleton reactive state ────────────────────────────────────────────────────────────
// Module-level refs, so every caller in the window shares them. `shallowRef` for the wallet objects: extension wallets are not safe to make deeply reactive.
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
/** One gRPC client per network and URL, created on first use. */
const clients = new Map<string, SuiGrpcClient>()
/** Stub clients installed by a test or end-to-end build, by network (empty in production). */
const clientOverrides = new Map<string, SuiGrpcClient>()

/**
 * Make {@link getSuiClient} return `client` for `network` (pass `null` to clear it). For test and end-to-end builds that stub the
 * network: gRPC-web responses are binary and cannot be faked at the fetch layer, so the client itself is replaced. Never for production.
 * @param network - the network label the stub answers for
 * @param client - the stand-in client, or `null` to remove it
 */
export function setSuiClientOverride(network: string, client: SuiGrpcClient | null): void {
  if (client) clientOverrides.set(network, client)
  else clientOverrides.delete(network)
}

/**
 * Return a memoised {@link SuiGrpcClient} for the network + gRPC-web URL (one instance each), or the stub set for the network.
 * @param network - `mainnet`, `testnet`, `devnet` or `localnet`
 * @param rpcUrl - the gRPC-web endpoint: https, or http on localhost for local development
 * @returns the client
 * @throws {Error} for an unknown network label or an endpoint that is not https (or local http)
 */
export function getSuiClient(network: string, rpcUrl: string): SuiGrpcClient {
  const stub = clientOverrides.get(network)
  if (stub) return stub
  if (!GRPC_NETWORKS.includes(network)) {
    throw new Error(`getSuiClient: unknown network "${network}" (expected ${GRPC_NETWORKS.join(', ')})`)
  }
  if (!isAllowedGrpcUrl(rpcUrl)) {
    throw new Error(
      `getSuiClient: rpcUrl must use https:// (or http://localhost / http://127.0.0.1 for local dev). Got: ${rpcUrl}`,
    )
  }
  // Keyed by both, so a changed URL gets its own client instead of silently reusing the old one.
  const key = `${network}|${rpcUrl}`
  let c = clients.get(key)
  if (!c) {
    c = new SuiGrpcClient({ network: network as SuiNetwork, baseUrl: rpcUrl })
    clients.set(key, c)
  }
  return c
}

/** Re-read the wallet-standard registry into the shared list (every wallet that can connect). */
function refreshWallets(): void {
  // markRaw: extension Wallet objects expose name/icon as ES-private-field getters that
  // throw when accessed through a Vue reactive Proxy.
  wallets.value = getWallets()
    .get()
    .filter((w) => isWalletWithRequiredFeatureSet(w, BASELINE))
    .map((w) => markRaw(w))
}

// Set once the registry listeners are attached; `useWallet()` calls `init()` on every use.
let initialised = false
/** Attach to the wallet-standard registry: read it now and follow wallets that register or unregister later. */
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

/** The `change` listener `standard:events` takes: the wallet's current account list. */
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

/** Forget the connected wallet and account, and stop listening to the wallet's events. */
function clearConnection(): void {
  stopWalletEvents?.()
  stopWalletEvents = null
  currentWallet.value = null
  account.value = null
}

/**
 * Connect a wallet: ask it to connect, keep its first account, and follow its account changes. One attempt at a time.
 * @param wallet - the wallet the person chose
 * @throws the wallet's own error (a rejected prompt, a locked wallet), after recording it in `error`
 */
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

/** Disconnect: ask the wallet to disconnect (best effort) and clear the local connection at once. */
function disconnect(): void {
  const disc = currentWallet.value?.features['standard:disconnect'] as
    | { disconnect?: () => Promise<void> }
    | undefined
  // A wallet that rejects its own disconnect must not become an unhandled rejection; local state
  // is cleared regardless.
  void Promise.resolve(disc?.disconnect?.()).catch(() => {})
  clearConnection()
}

/**
 * Sign a personal message with the connected wallet; returns the base64 signature.
 * @param message - the bytes to sign
 * @throws {Error} when no wallet is connected or the wallet cannot sign personal messages
 */
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
  /** `Transaction` for a success, `FailedTransaction` for a transaction that aborted on-chain. */
  $kind: string
  /** The executed transaction, on success. */
  Transaction?: { digest: string }
  /** The submitted-but-failed transaction. */
  FailedTransaction?: { digest: string }
}

/**
 * Extract the digest from an execute result, THROWING on `FailedTransaction`. Without this a caller
 * would treat an on-chain failure as success (both branches carry a digest), so failed submissions
 * must be surfaced, not swallowed.
 * @param res - the client's execution result
 * @returns the transaction digest
 * @throws {Error} for a failed on-chain transaction or an unexpected result kind
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
  /** The transaction digest (present for a failed transaction too). */
  digest: string
  /** `true` only when the effects status is success. */
  success: boolean
  /** The SDK result: `Transaction` on success, `FailedTransaction` when it aborted on-chain. */
  result: SuiClientTypes.TransactionResult<Include>
}

/**
 * Transaction executor bound to the connected wallet: sign and execute a PTB. Execution returns once the
 * node has the transaction; it does NOT wait until the transaction is indexed — call `waitForTransaction(digest)`
 * before reading state that depends on it.
 */
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
  /** Resolve once the transaction is available to reads (call before dependent reads). */
  waitForTransaction(digest: string): Promise<unknown>
}

/**
 * Refuse to sign for a chain the account cannot sign for. Wallet-standard accounts list the chains
 * they SUPPORT (`sui:mainnet`, `sui:testnet`, …), and most Sui wallets list all of them, so this
 * catches an unsupported chain, not the network the wallet UI happens to be set to. The binding that
 * matters is the explicit `chain` passed to `signTransaction`; the RPC's chain id is checked
 * separately ({@link assertRpcServesNetwork}).
 * @param acct - the connected account
 * @param chain - the chain the transaction will be signed for
 * @throws {Error} when the account does not list that chain
 */
function assertAccountOnChain(acct: WalletAccount, chain: `sui:${string}`): void {
  if (!acct.chains.includes(chain)) {
    const listed = acct.chains.length ? acct.chains.join(', ') : 'none'
    throw new Error(`The connected wallet account cannot sign for ${chain} (it lists: ${listed}).`)
  }
}

/** The short chain id Move, Published.toml and wallets use: the first four bytes of the genesis digest, hex. */
const KNOWN_CHAIN_IDS: Readonly<Record<string, string>> = { testnet: '4c78adac', mainnet: '35834a8a' }
/** Network and URL pairs whose chain id has already been checked (a good answer is cached for the page). */
const verifiedRpcs = new Set<string>()

/**
 * The short id of a node's `getChainIdentifier()` result. Nodes report the full base58 genesis
 * checkpoint digest (`69WiPg3D…` for testnet); the short id is its first four bytes in hex.
 * @param chainIdentifier - the node's base58 genesis digest
 * @returns the short id (eight hex digits)
 * @throws {Error} when the identifier decodes to fewer than four bytes
 */
export function shortChainId(chainIdentifier: string): string {
  const bytes = fromBase58(chainIdentifier)
  if (bytes.length < 4) throw new Error(`unexpected chain identifier: ${chainIdentifier}`)
  return Array.from(bytes.slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Refuse an RPC that does not serve `network`. Signing bytes for one chain and submitting them to
 * another's node fails confusingly at best; reading the chain identifier once (cached per
 * network + URL) and comparing it with the known id catches a mismatched pair up front. Only
 * `testnet` and `mainnet` have a fixed id; other networks are not checked.
 * @param client - the client to ask (an injected one without `core.getChainIdentifier` is not checked)
 * @param network - the network the app believes it is on
 * @param rpcUrl - the endpoint, for the cache key and the message
 * @throws {Error} when the node serves another chain
 */
async function assertRpcServesNetwork(client: unknown, network: string, rpcUrl: string): Promise<void> {
  const want = KNOWN_CHAIN_IDS[network]
  const key = `${network}|${rpcUrl}`
  if (!want || verifiedRpcs.has(key)) return
  const core = (client as { core?: { getChainIdentifier?: () => Promise<{ chainIdentifier: string }> } }).core
  if (!core?.getChainIdentifier) return // an injected client without the call: nothing to check
  const { chainIdentifier } = await core.getChainIdentifier()
  const got = shortChainId(chainIdentifier)
  if (got !== want) {
    throw new Error(`The RPC at ${rpcUrl} serves chain ${got}, not ${network} (${want}). Check the network and RPC URL.`)
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

/**
 * Build an executor bound to the connected wallet + network/RPC URL.
 * @param network - the network to sign for and submit to
 * @param rpcUrl - the gRPC-web endpoint
 * @param options - an injected client, for an app that has its own
 * @returns an executor that refuses to sign if the account or the selected network changes after it was built
 * @throws {Error} when no wallet is connected, the wallet cannot sign transactions, the account does not list the chain, or the node serves another chain
 */
export async function buildExecutor(network: string, rpcUrl: string, options: BuildExecutorOptions = {}): Promise<Executor> {
  const wallet = currentWallet.value
  const acct = account.value
  if (!wallet || !acct) throw new Error('Connect a wallet first.')
  const client: ExecutionClient = options.client ?? getSuiClient(network, rpcUrl)
  // The chain id wallet-standard uses; the wallet is told it explicitly, never left to infer it from its own UI setting.
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
  // The network generation this executor was built in; a network switch bumps it, and the executor then refuses to sign (see `signAndExecute`).
  const builtInGeneration = networkGeneration()

  // Narrowed once here: function declarations do not inherit the checks above.
  const boundAccount: WalletAccount = acct
  const signer = signFeature

  /** Overload 1: sign and execute, resolving with the digest and throwing on an on-chain failure. */
  async function signAndExecute(tx: Transaction): Promise<{ digest: string }>
  /** Overload 2: sign and execute with `include`, resolving with the requested details and a `success` flag (it does not throw on an on-chain failure). */
  async function signAndExecute<Include extends TransactionInclude>(
    tx: Transaction,
    opts: { include: Include },
  ): Promise<ExecutedTransaction<Include>>
  /**
   * The implementation of both overloads: check the account and network are still the ones this executor was built for, have the wallet sign,
   * then execute through the gRPC client.
   * @param tx - the transaction to sign and execute
   * @param opts - with `include`, return the detailed form
   */
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

// Readonly views are created once: `useWallet()` runs in every component that shows or needs the connection, and a new proxy (or, for a
// feature filter, a new computed re-filtering the list) per call is wasted work. The filtered lists are cached by feature set.
/** Readonly views of the shared state, so a caller can read it but never write it. */
const walletsView = readonly(wallets)
const currentWalletView = readonly(currentWallet)
const accountView = readonly(account)
const connectingView = readonly(connecting)
const errorView = readonly(error)
/** Filtered wallet lists by feature set, built once each. */
const filtered = new Map<string, DeepReadonly<Ref<Wallet[]>>>()

/**
 * The wallet list a caller sees: everything connectable, or only the wallets that have the features the caller needs.
 * @param needed - the required wallet-standard features (always including the baseline)
 * @returns a readonly, cached view
 */
function visibleWallets(needed: string[]): DeepReadonly<Ref<Wallet[]>> {
  if (needed.length === BASELINE.length) return walletsView
  const key = [...needed].sort().join('|')
  let view = filtered.get(key)
  if (!view) {
    view = readonly(computed(() => wallets.value.filter((w) => isWalletWithRequiredFeatureSet(w, needed))))
    filtered.set(key, view)
  }
  return view
}

/** Reactive connection state exposed by {@link useWallet} (all fields readonly). */
export interface WalletState {
  /** The wallets this caller may offer. */
  wallets: DeepReadonly<Ref<Wallet[]>>
  /** The connected wallet, or `null`. */
  currentWallet: DeepReadonly<Ref<Wallet | null>>
  /** The connected account, or `null`. */
  account: DeepReadonly<Ref<WalletAccount | null>>
  /** A connection attempt is in progress. */
  connecting: Readonly<Ref<boolean>>
  /** The last connection failure as a sentence, or `null`. */
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
 * @param options - the features this caller needs
 */
export function useWallet(options?: UseWalletOptions) {
  init()
  const visible = visibleWallets([...new Set([...BASELINE, ...(options?.requiredFeatures ?? [])])])
  return {
    wallets: visible,
    currentWallet: currentWalletView,
    account: accountView,
    connecting: connectingView,
    error: errorView,
    connect,
    disconnect,
    signPersonalMessage,
    getSuiClient,
    buildExecutor,
  }
}
