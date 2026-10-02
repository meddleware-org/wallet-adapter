// Runtime network selector singleton. Persists the chosen network + localnet RPC URL in
// localStorage so the selection survives page reloads. Shared across all tool views rendered
// in the same window — the same module singleton pattern as wallet.ts.
import { computed, readonly, ref } from 'vue'

function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
  } catch { return false }
}

export type MwNetwork = 'testnet' | 'mainnet' | 'localnet'

const DEFAULT_RPC: Record<Exclude<MwNetwork, 'localnet'>, string> = {
  testnet: 'https://fullnode.testnet.sui.io:443',
  mainnet:  'https://fullnode.mainnet.sui.io:443',
}
const DEFAULT_LOCALNET_RPC = 'http://127.0.0.1:9000'
const LS_NET   = 'mw:network'
const LS_LOCAL = 'mw:localnet-rpc'

// Browser storage can be missing or throw (blocked site data, some private modes, sandboxed
// frames): a read or write failure must never break the app — the selection simply is not kept.
function readStored(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
  } catch {
    return null
  }
}

function writeStored(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
  } catch {
    // Not persisted; the in-memory selection still applies for this page.
  }
}

function loadNetwork(): MwNetwork {
  const stored = readStored(LS_NET)
  return (stored === 'testnet' || stored === 'mainnet' || stored === 'localnet') ? stored : 'testnet'
}

function loadLocalnetRpc(): string {
  const stored = readStored(LS_LOCAL)
  return (stored && isLocalUrl(stored)) ? stored : DEFAULT_LOCALNET_RPC
}

// ── singleton refs ──────────────────────────────────────────────────────────────────────
const _network    = ref<MwNetwork>(loadNetwork())
const _localnetRpc = ref<string>(loadLocalnetRpc())

export function useNetwork() {
  const rpcUrl = computed(() =>
    _network.value === 'localnet' ? _localnetRpc.value : DEFAULT_RPC[_network.value],
  )

  function setNetwork(n: MwNetwork): void {
    _network.value = n
    writeStored(LS_NET, n)
  }

  function setLocalnetRpc(url: string): void {
    if (!isLocalUrl(url)) {
      throw new Error(
        `setLocalnetRpc: localnet RPC must be http://localhost or http://127.0.0.1. Got: ${url}`,
      )
    }
    _localnetRpc.value = url
    writeStored(LS_LOCAL, url)
  }

  return {
    network:     readonly(_network),
    rpcUrl:      readonly(rpcUrl),
    localnetRpc: readonly(_localnetRpc),
    setNetwork,
    setLocalnetRpc,
  }
}
