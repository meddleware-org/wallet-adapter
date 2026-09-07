// Runtime network selector singleton. Persists the chosen network + localnet RPC URL in
// localStorage so the selection survives page reloads. Shared across all tool views rendered
// in the same window — the same module singleton pattern as wallet.ts.
import { computed, readonly, ref } from 'vue'

export type MwNetwork = 'testnet' | 'mainnet' | 'localnet'

const DEFAULT_RPC: Record<Exclude<MwNetwork, 'localnet'>, string> = {
  testnet: 'https://fullnode.testnet.sui.io:443',
  mainnet:  'https://fullnode.mainnet.sui.io:443',
}
const DEFAULT_LOCALNET_RPC = 'http://127.0.0.1:9000'
const LS_NET   = 'mw:network'
const LS_LOCAL = 'mw:localnet-rpc'

function loadNetwork(): MwNetwork {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_NET) : null
  return (stored === 'testnet' || stored === 'mainnet' || stored === 'localnet') ? stored : 'testnet'
}

function loadLocalnetRpc(): string {
  return (typeof localStorage !== 'undefined' && localStorage.getItem(LS_LOCAL)) || DEFAULT_LOCALNET_RPC
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
    if (typeof localStorage !== 'undefined') localStorage.setItem(LS_NET, n)
  }

  function setLocalnetRpc(url: string): void {
    _localnetRpc.value = url
    if (typeof localStorage !== 'undefined') localStorage.setItem(LS_LOCAL, url)
  }

  return {
    network:     readonly(_network),
    rpcUrl:      readonly(rpcUrl),
    localnetRpc: readonly(_localnetRpc),
    setNetwork,
    setLocalnetRpc,
  }
}
