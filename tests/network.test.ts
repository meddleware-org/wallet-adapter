import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('useNetwork with unavailable browser storage', () => {
  it('loads with defaults and keeps working when storage throws', async () => {
    const blocked = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
    }
    vi.stubGlobal('sessionStorage', blocked)
    vi.stubGlobal('localStorage', blocked)
    const { useNetwork } = await import('../src/network.js')
    const net = useNetwork()
    expect(net.network.value).toBe('testnet')
    expect(() => net.setNetwork('mainnet')).not.toThrow()
    expect(net.network.value).toBe('mainnet')
    expect(net.rpcUrl.value).toBe('https://fullnode.mainnet.sui.io:443')
  })

  it('ignores a tampered stored network or localnet URL', async () => {
    const store = new Map([
      ['mw:network', 'evilnet'],
      ['mw:localnet-rpc', 'https://attacker.example'],
    ])
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: () => {} })
    const { useNetwork } = await import('../src/network.js')
    const net = useNetwork()
    expect(net.network.value).toBe('testnet')
    expect(net.localnetRpc.value).toBe('http://127.0.0.1:9000')
  })
})

describe('where the selection is kept (STORAGE_LEDGER B4)', () => {
  const memory = () => {
    const m = new Map<string, string>()
    return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } }
  }

  it('keeps it for the tab (sessionStorage), never in localStorage, and removes the old localStorage keys', async () => {
    const session = memory()
    const local = memory()
    local.m.set('mw:network', 'mainnet')
    local.m.set('mw:localnet-rpc', 'http://127.0.0.1:9123')
    vi.stubGlobal('sessionStorage', session.s)
    vi.stubGlobal('localStorage', local.s)
    const { useNetwork } = await import('../src/network.js')
    const net = useNetwork()
    expect(local.m.size).toBe(0)
    expect(net.network.value).toBe('testnet')
    net.setNetwork('mainnet')
    expect(session.m.get('mw:network')).toBe('mainnet')
    expect(local.m.size).toBe(0)
  })

  it('stores nothing when a build selects its own network', async () => {
    const session = memory()
    vi.stubGlobal('sessionStorage', session.s)
    vi.stubGlobal('localStorage', memory().s)
    const { selectBuiltNetwork, useNetwork } = await import('../src/network.js')
    selectBuiltNetwork('mainnet')
    expect(useNetwork().network.value).toBe('mainnet')
    expect(session.m.size).toBe(0)
  })

  it('stores nothing for setNetwork(n, { keep: false }), and keeps a person\'s own choice', async () => {
    const session = memory()
    vi.stubGlobal('sessionStorage', session.s)
    vi.stubGlobal('localStorage', memory().s)
    const { useNetwork } = await import('../src/network.js')
    const net = useNetwork()
    net.setNetwork('mainnet', { keep: false })
    expect(net.network.value).toBe('mainnet')
    expect(session.m.size).toBe(0)
    net.setNetwork('testnet')
    expect(session.m.get('mw:network')).toBe('testnet')
  })

  it('opens on the network a link names, and ignores an unknown one', async () => {
    const session = memory()
    vi.stubGlobal('sessionStorage', session.s)
    vi.stubGlobal('localStorage', memory().s)
    vi.stubGlobal('location', { search: '?tab=x&network=mainnet' })
    let { useNetwork } = await import('../src/network.js')
    expect(useNetwork().network.value).toBe('mainnet')
    vi.resetModules()
    vi.stubGlobal('sessionStorage', memory().s)
    vi.stubGlobal('location', { search: '?network=evilnet' })
    ;({ useNetwork } = await import('../src/network.js'))
    expect(useNetwork().network.value).toBe('testnet')
  })
})

describe('useNetwork validation', () => {
  it('refuses an unknown network name instead of storing it', async () => {
    vi.resetModules()
    const { useNetwork } = await import('../src/network.js')
    const net = useNetwork()
    expect(() => net.setNetwork('evilnet' as never)).toThrow(/unknown network/)
    expect(net.network.value).toBe('testnet')
    expect(net.rpcUrl.value).toBe('https://fullnode.testnet.sui.io:443')
  })
})

describe('explorerNetwork and selectBuiltNetwork', () => {
  const noStorage = () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  }

  it('maps the selected network to the one the explorer links know: mainnet, otherwise testnet', async () => {
    noStorage()
    const { useNetwork } = await import('../src/network.js')
    const net = useNetwork()
    expect(net.explorerNetwork.value).toBe('testnet')
    net.setNetwork('mainnet')
    expect(net.explorerNetwork.value).toBe('mainnet')
    net.setNetwork('localnet')
    expect(net.explorerNetwork.value).toBe('testnet')
  })

  it('selects the network a build targets and leaves the choice alone for anything else', async () => {
    noStorage()
    const { useNetwork, selectBuiltNetwork } = await import('../src/network.js')
    const net = useNetwork()
    selectBuiltNetwork('mainnet')
    expect(net.network.value).toBe('mainnet')
    selectBuiltNetwork(undefined)
    selectBuiltNetwork('localnet')
    selectBuiltNetwork('typo')
    expect(net.network.value).toBe('mainnet')
    selectBuiltNetwork('testnet')
    expect(net.network.value).toBe('testnet')
  })
})

describe('setRpcUrl (an operator full node)', () => {
  it('uses the configured full node for its network only, and the public one again on null', async () => {
    const { useNetwork, rpcUrlFor, networkGeneration } = await import('../src/network.js')
    const net = useNetwork()
    net.setNetwork('testnet')
    expect(rpcUrlFor('testnet')).toBe('https://fullnode.testnet.sui.io:443')
    const g = networkGeneration()
    net.setRpcUrl('testnet', 'https://sui.example:443')
    expect(rpcUrlFor('testnet')).toBe('https://sui.example:443')
    expect(net.rpcUrl.value).toBe('https://sui.example:443')
    expect(rpcUrlFor('mainnet')).toBe('https://fullnode.mainnet.sui.io:443')
    // A change on the selected network starts a new generation (a payment built before it is not signed).
    expect(networkGeneration()).toBe(g + 1)
    // The same value again, or a change on another network, does not.
    net.setRpcUrl('testnet', 'https://sui.example:443')
    net.setRpcUrl('mainnet', 'https://sui-main.example')
    expect(networkGeneration()).toBe(g + 1)
    net.setRpcUrl('testnet', null)
    expect(rpcUrlFor('testnet')).toBe('https://fullnode.testnet.sui.io:443')
  })

  it('refuses anything but an https URL without credentials, query or fragment, and localnet', async () => {
    const { useNetwork, isAllowedRpcOverride } = await import('../src/network.js')
    const net = useNetwork()
    for (const bad of ['http://sui.example', 'https://user:pw@sui.example', 'https://sui.example/?k=1', 'https://sui.example/#x', 'sui.example', 'javascript:alert(1)']) {
      expect(isAllowedRpcOverride(bad)).toBe(false)
      expect(() => net.setRpcUrl('testnet', bad)).toThrow(/https URL/)
    }
    expect(() => net.setRpcUrl('localnet' as never, 'https://sui.example')).toThrow(/only testnet and mainnet/)
  })

  it('is never written to storage', async () => {
    const store: Record<string, string> = {}
    const s = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v }, removeItem: () => {} }
    vi.stubGlobal('localStorage', s)
    vi.stubGlobal('sessionStorage', s)
    const { useNetwork } = await import('../src/network.js')
    useNetwork().setRpcUrl('mainnet', 'https://sui-main.example')
    expect(Object.values(store).join(' ')).not.toContain('sui-main.example')
  })
})
