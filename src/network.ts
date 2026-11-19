// Runtime network selector singleton. Keeps the chosen network and localnet RPC URL in sessionStorage, so the selection survives
// reloads and in-app navigation for this tab and goes when the tab closes: a session record of a selection the person made, which is
// strictly necessary storage (PECR Sch. A1 para 4(e); workspace docs/legal STORAGE_LEDGER B4). Earlier versions used localStorage;
// those keys are removed on load. A link may carry `?network=<testnet|mainnet|localnet>` to open on a network (read once, at load).
// Shared across all tool views rendered in the same window — the same module singleton pattern as wallet.ts.
import { computed, readonly, ref } from 'vue'

/** `http://localhost` or `http://127.0.0.1` (any port/path): the only plain-http endpoint accepted, for local dev. */
export function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
  } catch { return false }
}

export type MwNetwork = 'testnet' | 'mainnet' | 'localnet'

/** The networks this adapter selects between. */
export const MW_NETWORKS: readonly MwNetwork[] = ['testnet', 'mainnet', 'localnet']

const DEFAULT_RPC: Record<Exclude<MwNetwork, 'localnet'>, string> = {
  testnet: 'https://fullnode.testnet.sui.io:443',
  mainnet:  'https://fullnode.mainnet.sui.io:443',
}
const DEFAULT_LOCALNET_RPC = 'http://127.0.0.1:9000'

/**
 * The gRPC-web endpoint for `network`: the public fullnode for testnet and mainnet, and for localnet the endpoint the visitor set
 * (`setLocalnetRpc`, default `http://127.0.0.1:9000`). For code that needs a client for a network other than the selected one.
 */
export function rpcUrlFor(network: MwNetwork): string {
  return network === 'localnet' ? _localnetRpc.value : (_rpcOverrides.value[network] ?? DEFAULT_RPC[network])
}

/**
 * An operator's full node for testnet or mainnet: an https URL with no credentials, query or fragment (the gRPC-web endpoint, usually
 * an origin such as `https://fullnode.example:443`). Anything else is refused, so a configuration value can never point the wallet at
 * plain http or carry a secret in the URL.
 */
export function isAllowedRpcOverride(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash && !!u.hostname
  } catch {
    return false
  }
}
const LS_NET   = 'mw:network'
const LS_LOCAL = 'mw:localnet-rpc'

// Browser storage can be missing or throw (blocked site data, some private modes, sandboxed
// frames): a read or write failure must never break the app — the selection simply is not kept.
function readStored(key: string): string | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null
  } catch {
    return null
  }
}

function writeStored(key: string, value: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, value)
  } catch {
    // Not kept; the in-memory selection still applies for this page.
  }
}

/** Remove what versions before the move to sessionStorage left in localStorage (nothing reads it any more). */
function forgetLegacyStorage(): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(LS_NET)
    localStorage.removeItem(LS_LOCAL)
  } catch {
    // Storage blocked: there is nothing we could have written either.
  }
}

function isNetwork(v: unknown): v is MwNetwork {
  return v === 'testnet' || v === 'mainnet' || v === 'localnet'
}

/** The `network` query parameter of the page's address, if it names a known network. */
function networkFromUrl(): MwNetwork | null {
  try {
    if (typeof location === 'undefined') return null
    const v = new URLSearchParams(location.search).get('network')
    return isNetwork(v) ? v : null
  } catch {
    return null
  }
}

function loadNetwork(): MwNetwork {
  forgetLegacyStorage()
  const fromUrl = networkFromUrl()
  if (fromUrl) {
    writeStored(LS_NET, fromUrl)
    return fromUrl
  }
  const stored = readStored(LS_NET)
  return isNetwork(stored) ? stored : 'testnet'
}

function loadLocalnetRpc(): string {
  const stored = readStored(LS_LOCAL)
  return (stored && isLocalUrl(stored)) ? stored : DEFAULT_LOCALNET_RPC
}

// Bumped whenever the selected network changes. An executor remembers the generation it was built
// in and refuses to sign after a switch (it would sign for, and submit to, the old network).
let generation = 0
/** The current network generation (see `useNetwork().setNetwork`). */
export function networkGeneration(): number {
  return generation
}

// ── singleton refs ──────────────────────────────────────────────────────────────────────
const _network    = ref<MwNetwork>(loadNetwork())
const _localnetRpc = ref<string>(loadLocalnetRpc())
// Operator overrides of the public full nodes (`setRpcUrl`): kept for this page only, never in storage, so a visitor cannot set one.
const _rpcOverrides = ref<Partial<Record<Exclude<MwNetwork, 'localnet'>, string>>>({})

// One computed and one readonly view for the whole app: `useNetwork()` is called from many components and modules, and a fresh computed per
// call would each re-evaluate and none could be shared.
const _rpcUrl = computed(() => rpcUrlFor(_network.value))
const networkView = readonly(_network)
const rpcUrlView = readonly(_rpcUrl)
// SuiVision has no localnet, and nothing of ours is deployed there, so a localnet entity links to the testnet explorer, where it is inert.
const _explorerNetwork = computed<'mainnet' | 'testnet'>(() => (_network.value === 'mainnet' ? 'mainnet' : 'testnet'))
const explorerNetworkView = readonly(_explorerNetwork)
const localnetRpcView = readonly(_localnetRpc)

export function useNetwork() {
  function setNetwork(n: MwNetwork): void {
    // A JavaScript caller (or a stale stored value) must not be able to select an unknown network: its
    // rpcUrl would be undefined and the chain checks keyed on the name would mean nothing.
    if (!MW_NETWORKS.includes(n)) {
      throw new Error(`setNetwork: unknown network "${String(n)}" (expected ${MW_NETWORKS.join(', ')})`)
    }
    if (_network.value !== n) generation++
    _network.value = n
    writeStored(LS_NET, n)
  }

  function setLocalnetRpc(url: string): void {
    if (!isLocalUrl(url)) {
      throw new Error(
        `setLocalnetRpc: localnet RPC must be http://localhost or http://127.0.0.1. Got: ${url}`,
      )
    }
    if (_localnetRpc.value !== url) generation++
    _localnetRpc.value = url
    writeStored(LS_LOCAL, url)
  }

  /**
   * Use the operator's full node for `network` (testnet or mainnet) instead of the public one, or the public one again with `null`.
   * The deployment's configuration calls this before the wallet is used (Link in Bio: the instance's `suiRpcUrl`); the URL must pass
   * {@link isAllowedRpcOverride}. A change on the selected network starts a new network generation, so a payment built before it is
   * not signed against the new node. The wallet still checks the node serves the network's chain before signing.
   */
  function setRpcUrl(network: Exclude<MwNetwork, 'localnet'>, url: string | null): void {
    if (network !== 'testnet' && network !== 'mainnet') {
      throw new Error(`setRpcUrl: only testnet and mainnet take a configured full node (got "${String(network)}")`)
    }
    if (url !== null && !isAllowedRpcOverride(url)) {
      throw new Error(`setRpcUrl: the full node must be an https URL without credentials, query or fragment. Got: ${url}`)
    }
    const before = rpcUrlFor(network)
    const next = { ..._rpcOverrides.value }
    if (url === null) delete next[network]
    else next[network] = url
    _rpcOverrides.value = next
    if (_network.value === network && rpcUrlFor(network) !== before) generation++
  }

  return {
    network:     networkView,
    rpcUrl:      rpcUrlView,
    /** The network as the block-explorer links know it (`mainnet`, otherwise `testnet`). */
    explorerNetwork: explorerNetworkView,
    localnetRpc: localnetRpcView,
    setNetwork,
    setLocalnetRpc,
    setRpcUrl,
  }
}

/**
 * A standalone build targets one network (its `VITE_NETWORK`): select it in the shared selector so the client, the ids, the explorer links
 * and the status bar all agree. Only `testnet` and `mainnet` are built for; anything else (unset, a typo) leaves the stored choice alone.
 * Embedded in the dashboard the host's selector rules and this is not called.
 */
export function selectBuiltNetwork(built: string | undefined): void {
  if (built === 'testnet' || built === 'mainnet') useNetwork().setNetwork(built)
}
