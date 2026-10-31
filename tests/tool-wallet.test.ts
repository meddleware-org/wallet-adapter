import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getWallets } from '@mysten/wallet-standard'
import { createToolWallet } from '../src/tool-wallet.js'
import { getSuiClient, setSuiClientOverride, useWallet } from '../src/wallet.js'
import { rpcUrlFor, useNetwork, MW_NETWORKS } from '../src/network.js'

const wallet = (name: string, features: string[]) =>
  ({
    version: '1.0.0',
    name,
    icon: 'data:image/png;base64,AA==',
    chains: ['sui:testnet'],
    accounts: [],
    // A registered wallet must look like a real one: connect and events are what the registry's own checks look for.
    features: {
      'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: [] }) },
      'standard:events': { version: '1.0.0', on: () => () => {} },
      ...Object.fromEntries(features.filter((f) => f !== 'standard:connect').map((f) => [f, { version: '1.0.0' }])),
    },
  }) as never

describe('createToolWallet', () => {
  it('binds the shared singleton to the selected network, read at call time', () => {
    const tool = createToolWallet()
    const { setNetwork } = useNetwork()
    setNetwork('testnet')
    expect(tool.getSuiClient()).toBe(getSuiClient('testnet', rpcUrlFor('testnet')))
    setNetwork('mainnet')
    expect(tool.getSuiClient()).toBe(getSuiClient('mainnet', rpcUrlFor('mainnet')))
    expect(tool.getSuiClient()).not.toBe(getSuiClient('testnet', rpcUrlFor('testnet')))
    setNetwork('testnet')
  })

  it('shares the connection state with every other caller (it is the same singleton)', () => {
    const a = createToolWallet().useWallet()
    const b = createToolWallet({ requiredFeatures: ['sui:signTransaction'] }).useWallet()
    expect(a.account).toBe(b.account)
    expect(a.currentWallet).toBe(b.currentWallet)
    expect(a.connecting).toBe(b.connecting)
    expect(a.error).toBe(b.error)
    expect(a.account).toBe(useWallet().account)
  })

  it('offers everything a tool might use', () => {
    const w = createToolWallet().useWallet()
    for (const k of ['wallets', 'currentWallet', 'account', 'connecting', 'error', 'connect', 'disconnect', 'signPersonalMessage', 'signAndExecute', 'getSuiClient', 'buildExecutor']) {
      expect(w, k).toHaveProperty(k)
    }
  })

  it('refuses to sign or execute before a wallet is connected', async () => {
    const tool = createToolWallet()
    await expect(tool.signPersonalMessage(new Uint8Array([1]))).rejects.toThrow(/connect a wallet first/i)
    await expect(tool.buildExecutor()).rejects.toThrow(/connect a wallet first/i)
    await expect(tool.signAndExecute({} as never)).rejects.toThrow(/connect a wallet first/i)
    await expect(tool.useWallet().signAndExecute({} as never)).rejects.toThrow(/connect a wallet first/i)
  })

  describe('feature filtering is per tool', () => {
    const unregister: (() => void)[] = []
    beforeEach(() => {
      unregister.push(
        getWallets().register(wallet('Signs transactions', ['standard:connect', 'sui:signTransaction'])),
        getWallets().register(wallet('Signs messages', ['standard:connect', 'sui:signPersonalMessage'])),
        getWallets().register(wallet('Both', ['standard:connect', 'sui:signTransaction', 'sui:signPersonalMessage'])),
      )
    })
    afterEach(() => unregister.splice(0).forEach((u) => u()))

    it('a tool sees only the wallets that have what it needs, and no tool narrows another', () => {
      const names = (list: readonly { name: string }[]) => list.map((w) => w.name).sort()
      const tx = createToolWallet({ requiredFeatures: ['sui:signTransaction'] }).useWallet()
      const msg = createToolWallet({ requiredFeatures: ['sui:signPersonalMessage'] }).useWallet()
      const both = createToolWallet({ requiredFeatures: ['sui:signPersonalMessage', 'sui:signTransaction'] }).useWallet()
      const any = createToolWallet().useWallet()
      expect(names(tx.wallets.value)).toEqual(['Both', 'Signs transactions'])
      expect(names(msg.wallets.value)).toEqual(['Both', 'Signs messages'])
      expect(names(both.wallets.value)).toEqual(['Both'])
      expect(names(any.wallets.value)).toEqual(['Both', 'Signs messages', 'Signs transactions'])
    })

    it('reuses one filtered list per feature set, however many components ask', () => {
      const a = useWallet({ requiredFeatures: ['sui:signTransaction'] }).wallets
      const b = useWallet({ requiredFeatures: ['sui:signTransaction'] }).wallets
      const reordered = useWallet({ requiredFeatures: ['sui:signTransaction', 'standard:connect'] }).wallets
      const other = useWallet({ requiredFeatures: ['sui:signPersonalMessage'] }).wallets
      expect(a).toBe(b)
      expect(a).toBe(reordered)
      expect(a).not.toBe(other)
      expect(useWallet().wallets).toBe(useWallet({ requiredFeatures: [] }).wallets)
    })
  })
})

describe('cached views', () => {
  it('useWallet returns the same readonly refs every time', () => {
    const a = useWallet()
    const b = useWallet()
    for (const k of ['account', 'currentWallet', 'connecting', 'error', 'wallets'] as const) expect(a[k], k).toBe(b[k])
  })

  it('useNetwork returns the same readonly refs every time', () => {
    const a = useNetwork()
    const b = useNetwork()
    for (const k of ['network', 'rpcUrl', 'localnetRpc'] as const) expect(a[k], k).toBe(b[k])
  })
})

describe('rpcUrlFor', () => {
  it('names the public fullnode for testnet and mainnet, and the chosen endpoint for localnet', () => {
    expect(rpcUrlFor('testnet')).toBe('https://fullnode.testnet.sui.io:443')
    expect(rpcUrlFor('mainnet')).toBe('https://fullnode.mainnet.sui.io:443')
    const { setLocalnetRpc, localnetRpc } = useNetwork()
    expect(rpcUrlFor('localnet')).toBe(localnetRpc.value)
    setLocalnetRpc('http://localhost:9123')
    expect(rpcUrlFor('localnet')).toBe('http://localhost:9123')
    setLocalnetRpc('http://127.0.0.1:9000')
  })

  it('agrees with the selected network\'s rpcUrl for every network', () => {
    const net = useNetwork()
    const before = net.network.value
    for (const n of MW_NETWORKS) {
      net.setNetwork(n)
      expect(net.rpcUrl.value, n).toBe(rpcUrlFor(n))
    }
    net.setNetwork(before)
  })
})

describe('setSuiClientOverride', () => {
  afterEach(() => {
    setSuiClientOverride('testnet', null)
    setSuiClientOverride('mainnet', null)
  })

  it('makes getSuiClient return the stub for that network only, until it is cleared', () => {
    const stub = { stub: true } as never
    const real = getSuiClient('mainnet', 'https://rpc.example/override')
    setSuiClientOverride('testnet', stub)
    expect(getSuiClient('testnet', 'https://rpc.example/any')).toBe(stub)
    expect(createToolWallet().getSuiClient()).toBe(useNetwork().network.value === 'testnet' ? stub : createToolWallet().getSuiClient())
    expect(getSuiClient('mainnet', 'https://rpc.example/override')).toBe(real)
    setSuiClientOverride('testnet', null)
    expect(getSuiClient('testnet', 'https://rpc.example/any')).not.toBe(stub)
  })

  it('does not bypass the network-label rule when there is no stub', () => {
    expect(() => getSuiClient('evilnet', 'https://rpc.example')).toThrow(/unknown network/)
  })
})
