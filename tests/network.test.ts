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
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: () => {} })
    const { useNetwork } = await import('../src/network.js')
    const net = useNetwork()
    expect(net.network.value).toBe('testnet')
    expect(net.localnetRpc.value).toBe('http://127.0.0.1:9000')
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
