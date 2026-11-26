/**
 * Tests for the network selector (`src/network.ts`): it keeps working when browser storage is blocked, ignores a tampered stored value, keeps the choice for
 * the tab only (sessionStorage, never localStorage, STORAGE_LEDGER B4) and only when the person made it, opens on the network a link names, validates what it
 * is given, and takes an operator's full node without ever storing it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

// The selector is a module singleton, so each test re-imports it fresh (the tests use `vi.resetModules`) and restores any stubbed global afterwards.
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

// Storage can throw (blocked site data, some private modes): the app must load with defaults and keep working.
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
    // Both storages throw on every access, as a browser with site data blocked does.
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

// The selection is a session record of a choice the person made (strictly necessary, PECR Sch. A1 para 4(e)): the tab's sessionStorage, never localStorage.
describe('where the selection is kept (STORAGE_LEDGER B4)', () => {
  /** An in-memory stand-in for a Storage, with a handle on its contents so a test can see exactly what was written. */
  const memory = () => {
    const m = new Map<string, string>()
    return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } }
  }

  it('keeps it for the tab (sessionStorage), never in localStorage, and removes the old localStorage keys', async () => {
    const session = memory()
    const local = memory()
    // What an earlier version left in localStorage: it must be removed on load, and never read.
    local.m.set('mw:network', 'mainnet')
    local.m.set('mw:localnet-rpc', 'http://127.0.0.1:9123')
    vi.stubGlobal('sessionStorage', session.s)
    vi.stubGlobal('localStorage', local.s)
    const { useNetwork } = await import('../src/network.js')
    const net = useNetwork()
    // The old keys are gone and the stale "mainnet" was not used: the selection starts at testnet.
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
    // A build always selects the same network, so there is no choice to remember and nothing is written.
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

// A JavaScript caller or a stale stored value must not be able to select an unknown network (its endpoint would be undefined).
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

// An operator's full node is configuration, not a visitor choice: https only, no credentials, never written to storage.
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

  // A configured URL can carry a credential (the very thing this setter refuses), so the refusal says where it came from, never the whole value.
  it('does not repeat a refused URL, which may carry a credential, in its message', async () => {
    const { useNetwork, describeUrl } = await import('../src/network.js')
    const net = useNetwork()
    const bad = 'https://user:s3cret@sui.example/path?apikey=KEY123#frag'
    let message = ''
    try { net.setRpcUrl('testnet', bad) } catch (e) { message = (e as Error).message }
    expect(message).toContain('https://sui.example')
    expect(message).not.toMatch(/s3cret|KEY123|apikey|user:/)
    // Not a URL at all: not repeated, and an address with no host says so.
    expect(describeUrl('https://user:s3cret@')).toBe('(not a valid URL)')
    expect(describeUrl('data:text/plain,s3cret')).toBe('(an address with no host)')
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
