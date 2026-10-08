import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { useWallet, getSuiClient, buildExecutor, digestFromExecuteResult, shortChainId } from '../src/wallet.js'

// The connect / sign paths require a real wallet extension injecting into `window`
// (wallet-standard's registry is window-based). Those are exercised manually in a browser.
// These unit tests cover the parts that are deterministic off a browser: the Sui client
// cache and the "connect first" guards on the signing operations.

describe('getSuiClient: network and url rules', () => {
  it('refuses an unknown network label', () => {
    expect(() => getSuiClient('evilnet', 'https://rpc.example')).toThrow(/unknown network/)
  })

  it('accepts https anywhere and plain http only on localhost / 127.0.0.1, with one rule', () => {
    expect(() => getSuiClient('localnet', 'http://127.0.0.1:9000')).not.toThrow()
    expect(() => getSuiClient('localnet', 'http://localhost:9000/x')).not.toThrow()
    for (const bad of ['ws://localhost:9000', 'ftp://127.0.0.1', 'http://rpc.example', 'file:///tmp/x', 'not a url']) {
      expect(() => getSuiClient('localnet', bad), bad).toThrow(/rpcUrl must use https/)
    }
  })
})

describe('getSuiClient', () => {
  it('memoises one client per network+url', () => {
    const a = getSuiClient('testnet', 'https://rpc.example/one')
    const b = getSuiClient('testnet', 'https://rpc.example/one')
    expect(a).toBe(b)
  })

  it('returns distinct clients for different urls on the same network', () => {
    const a = getSuiClient('testnet', 'https://rpc.example/one')
    const b = getSuiClient('testnet', 'https://rpc.example/two')
    expect(a).not.toBe(b)
  })

  it('returns distinct clients for different networks', () => {
    const a = getSuiClient('testnet', 'https://rpc.example/same')
    const b = getSuiClient('mainnet', 'https://rpc.example/same')
    expect(a).not.toBe(b)
  })
})

describe('operation guards before connect', () => {
  it('exposes readonly reactive state with no wallet connected initially', () => {
    const w = useWallet()
    expect(w.account.value).toBeNull()
    expect(w.connecting.value).toBe(false)
    expect(Array.isArray(w.wallets.value)).toBe(true)
  })

  it('signPersonalMessage rejects when no wallet is connected', async () => {
    const { signPersonalMessage } = useWallet()
    await expect(signPersonalMessage(new Uint8Array([1]))).rejects.toThrow(/connect a wallet first/i)
  })

  it('buildExecutor (via composable) rejects when no wallet is connected', async () => {
    const { buildExecutor: build } = useWallet()
    await expect(build('testnet', 'https://rpc.example')).rejects.toThrow(/connect a wallet first/i)
  })

  it('buildExecutor (standalone export) rejects when no wallet is connected', async () => {
    await expect(buildExecutor('testnet', 'https://rpc.example')).rejects.toThrow(/connect a wallet first/i)
  })
})

describe('digestFromExecuteResult (failed-tx surfacing)', () => {
  it('returns the digest for a successful Transaction', () => {
    const res = { $kind: 'Transaction', Transaction: { digest: '0xabc' } }
    expect(digestFromExecuteResult(res)).toEqual({ digest: '0xabc' })
  })

  it('throws on a FailedTransaction instead of returning its digest', () => {
    const res = { $kind: 'FailedTransaction', FailedTransaction: { digest: '0xdead' } }
    expect(() => digestFromExecuteResult(res)).toThrow(/0xdead/)
    expect(() => digestFromExecuteResult(res)).toThrow(/failed on-chain/i)
  })

  it('throws on an unexpected kind with no Transaction payload', () => {
    expect(() => digestFromExecuteResult({ $kind: 'Weird' })).toThrow(/unexpected execution result/i)
  })
})

/** The shared client for `network` + `url`, with its chain-identifier read answered locally (no network). */
/** What a node really reports (`getChainIdentifier`): the full base58 genesis digest. */
const CHAIN_IDENTIFIER = { testnet: '69WiPg3DAQiwdxfncX6wYQ2siKwAe6L9BZthQea3JNMD', mainnet: '4btiuiMPvEENsttpZC7CZ53DruC3MAgfznDbASZ7DR6S' } as const
function stubChainId(network: 'testnet' | 'mainnet', url: string, id: string = CHAIN_IDENTIFIER[network]) {
  return vi.spyOn(getSuiClient(network, url).core, 'getChainIdentifier').mockResolvedValue({ chainIdentifier: id })
}

// A minimal wallet-standard wallet: `connect()` accepts any Wallet object, so the connection and
// event paths are testable without the window-based registry.
function fakeWallet(accounts: Array<{ address: string; chains: string[] }>) {
  let listener: ((p: { accounts?: unknown[] }) => void) | null = null
  const unsubscribe = vi.fn(() => {
    listener = null
  })
  const signTransaction = vi.fn(async () => ({ bytes: 'AA==', signature: 'sig' }))
  const wallet = {
    name: 'Fake',
    version: '1.0.0',
    icon: 'data:image/png;base64,',
    chains: ['sui:testnet'],
    accounts,
    features: {
      'standard:connect': { version: '1.0.0', connect: async () => ({ accounts }) },
      'standard:disconnect': { version: '1.0.0', disconnect: async () => {} },
      'standard:events': {
        version: '1.0.0',
        on: (_event: string, l: (p: { accounts?: unknown[] }) => void) => {
          listener = l
          return unsubscribe
        },
      },
      'sui:signTransaction': { version: '2.0.0', signTransaction },
    },
  }
  return {
    wallet: wallet as unknown as Parameters<ReturnType<typeof useWallet>['connect']>[0],
    emit: (p: { accounts?: unknown[] }) => listener?.(p),
    unsubscribe,
    signTransaction,
  }
}

const ALICE = { address: '0xa11ce', chains: ['sui:testnet'] }
const BOB = { address: '0xb0b', chains: ['sui:testnet'] }

describe('wallet change events', () => {
  afterEach(() => useWallet().disconnect())

  it('follows an account switch made inside the wallet', async () => {
    const w = useWallet()
    const fake = fakeWallet([ALICE, BOB])
    await w.connect(fake.wallet)
    expect(w.account.value?.address).toBe(ALICE.address)
    fake.emit({ accounts: [BOB] })
    expect(w.account.value?.address).toBe(BOB.address)
  })

  it('keeps the current account when it is still exposed', async () => {
    const w = useWallet()
    const fake = fakeWallet([ALICE, BOB])
    await w.connect(fake.wallet)
    fake.emit({ accounts: [BOB, ALICE] })
    expect(w.account.value?.address).toBe(ALICE.address)
  })

  it('drops the connection when the wallet reports no accounts, and unsubscribes', async () => {
    const w = useWallet()
    const fake = fakeWallet([ALICE])
    await w.connect(fake.wallet)
    fake.emit({ accounts: [] })
    expect(w.account.value).toBeNull()
    expect(w.currentWallet.value).toBeNull()
    expect(fake.unsubscribe).toHaveBeenCalledOnce()
  })

  it('ignores change events that carry no account list', async () => {
    const w = useWallet()
    const fake = fakeWallet([ALICE])
    await w.connect(fake.wallet)
    fake.emit({})
    expect(w.account.value?.address).toBe(ALICE.address)
  })

  it('unsubscribes on disconnect', async () => {
    const w = useWallet()
    const fake = fakeWallet([ALICE])
    await w.connect(fake.wallet)
    w.disconnect()
    expect(fake.unsubscribe).toHaveBeenCalledOnce()
  })
})

describe('executor chain and account binding', () => {
  afterEach(() => useWallet().disconnect())

  it('refuses to build an executor for a chain the account does not list', async () => {
    const w = useWallet()
    await w.connect(fakeWallet([ALICE]).wallet)
    await expect(buildExecutor('mainnet', 'https://rpc.example')).rejects.toThrow(/cannot sign for sui:mainnet/)
  })

  it('refuses to sign after the account changed', async () => {
    stubChainId('testnet', 'https://rpc.example')
    const w = useWallet()
    const fake = fakeWallet([ALICE, BOB])
    await w.connect(fake.wallet)
    const exec = await buildExecutor('testnet', 'https://rpc.example')
    fake.emit({ accounts: [BOB] })
    await expect(exec.signAndExecute({} as never)).rejects.toThrow(/account changed/)
    expect(fake.signTransaction).not.toHaveBeenCalled()
  })
})

describe('executor include option', () => {
  beforeEach(() => void stubChainId('testnet', 'https://rpc.example'))
  afterEach(() => useWallet().disconnect())

  it('returns the typed result without throwing for an on-chain failure', async () => {
    const w = useWallet()
    await w.connect(fakeWallet([ALICE]).wallet)
    const exec = await buildExecutor('testnet', 'https://rpc.example')
    const client = getSuiClient('testnet', 'https://rpc.example')
    const failed = {
      $kind: 'FailedTransaction',
      FailedTransaction: { digest: 'D1', status: { success: false, error: { message: 'abort' } }, effects: {} },
    }
    const spy = vi.spyOn(client, 'executeTransaction').mockResolvedValue(failed as never)
    const out = await exec.signAndExecute({} as never, { include: { effects: true } })
    expect(out).toMatchObject({ digest: 'D1', success: false })
    expect(spy.mock.calls[0][0]).toMatchObject({ include: { effects: true } })
    // The plain form still throws on the same failure.
    await expect(exec.signAndExecute({} as never)).rejects.toThrow(/failed on-chain/)
    spy.mockRestore()
  })

  it('reports success from the effects status', async () => {
    const w = useWallet()
    await w.connect(fakeWallet([ALICE]).wallet)
    const exec = await buildExecutor('testnet', 'https://rpc.example')
    const client = getSuiClient('testnet', 'https://rpc.example')
    const ok = { $kind: 'Transaction', Transaction: { digest: 'D2', status: { success: true, error: null } } }
    const spy = vi.spyOn(client, 'executeTransaction').mockResolvedValue(ok as never)
    expect(await exec.signAndExecute({} as never, { include: { objectTypes: true } })).toMatchObject({
      digest: 'D2',
      success: true,
    })
    spy.mockRestore()
  })
})

describe('executor with an injected client', () => {
  afterEach(() => useWallet().disconnect())

  it('executes and waits through the given client, keeping the chain and account checks', async () => {
    const w = useWallet()
    const fake = fakeWallet([ALICE, BOB])
    await w.connect(fake.wallet)
    const ok = { $kind: 'Transaction', Transaction: { digest: 'D3', status: { success: true, error: null } } }
    const client = { executeTransaction: vi.fn(async () => ok), waitForTransaction: vi.fn(async () => ok) }
    const shared = vi.spyOn(getSuiClient('testnet', 'https://rpc.example'), 'executeTransaction')
    const exec = await buildExecutor('testnet', 'https://rpc.example', { client: client as never })
    expect(await exec.signAndExecute({} as never)).toEqual({ digest: 'D3' })
    await exec.waitForTransaction('D3')
    expect(client.executeTransaction).toHaveBeenCalledOnce()
    expect(client.waitForTransaction).toHaveBeenCalledWith({ digest: 'D3' })
    expect(shared).not.toHaveBeenCalled()
    shared.mockRestore()

    await expect(buildExecutor('mainnet', 'https://rpc.example', { client: client as never })).rejects.toThrow(/cannot sign for sui:mainnet/)
    fake.emit({ accounts: [BOB] })
    await expect(exec.signAndExecute({} as never)).rejects.toThrow(/account changed/)
  })
})

describe('RPC / network binding', () => {
  afterEach(() => useWallet().disconnect())
  const okClient = (chainIdentifier: string) => ({
    core: { getChainIdentifier: vi.fn(async () => ({ chainIdentifier })) },
    executeTransaction: vi.fn(),
    waitForTransaction: vi.fn(),
  })

  it('refuses an RPC that serves another chain than the network, and caches a good answer', async () => {
    const w = useWallet()
    await w.connect(fakeWallet([{ address: '0xa', chains: ['sui:testnet', 'sui:mainnet'] }]).wallet)
    const wrong = okClient(CHAIN_IDENTIFIER.mainnet) // mainnet's chain behind a testnet label
    await expect(buildExecutor('testnet', 'https://rpc-wrong.example', { client: wrong as never })).rejects.toThrow(/serves chain 35834a8a, not testnet \(4c78adac\)/)
    const right = okClient(CHAIN_IDENTIFIER.testnet)
    await buildExecutor('testnet', 'https://rpc-right.example', { client: right as never })
    await buildExecutor('testnet', 'https://rpc-right.example', { client: right as never })
    expect(right.core.getChainIdentifier).toHaveBeenCalledOnce() // verified once per network + URL
  })

  it('an executor built before a network switch refuses to sign after it', async () => {
    const { useNetwork } = await import('../src/network.js')
    const w = useWallet()
    const fake = fakeWallet([ALICE])
    await w.connect(fake.wallet)
    stubChainId('testnet', 'https://rpc.example')
    const exec = await buildExecutor('testnet', 'https://rpc.example')
    useNetwork().setNetwork(useNetwork().network.value === 'mainnet' ? 'testnet' : 'mainnet')
    await expect(exec.signAndExecute({} as never)).rejects.toThrow(/network changed/)
    expect(fake.signTransaction).not.toHaveBeenCalled()
    useNetwork().setNetwork('testnet')
  })
})

describe('connect serialisation and disconnect', () => {
  afterEach(() => useWallet().disconnect())

  it('ignores a connect while another is in flight', async () => {
    const w = useWallet()
    let release!: () => void
    const slow = fakeWallet([ALICE])
    ;(slow.wallet as unknown as { features: Record<string, { connect: () => Promise<unknown> }> }).features['standard:connect']!.connect = () =>
      new Promise((r) => (release = () => r({ accounts: [ALICE] })))
    const first = w.connect(slow.wallet)
    await w.connect(fakeWallet([BOB]).wallet) // ignored while the first prompt is open
    release()
    await first
    expect(w.account.value?.address).toBe('0xa11ce')
  })

  it('a wallet whose disconnect rejects does not raise an unhandled rejection', async () => {
    const w = useWallet()
    const fake = fakeWallet([ALICE])
    ;(fake.wallet as unknown as { features: Record<string, { disconnect: () => Promise<void> }> }).features['standard:disconnect']!.disconnect = async () => {
      throw new Error('boom')
    }
    await w.connect(fake.wallet)
    expect(() => w.disconnect()).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(w.account.value).toBeNull()
  })

  it('a connect failure is exposed through error and rethrown', async () => {
    const w = useWallet()
    const bad = fakeWallet([ALICE])
    ;(bad.wallet as unknown as { features: Record<string, { connect: () => Promise<unknown> }> }).features['standard:connect']!.connect = async () => {
      throw new Error('User rejected the request')
    }
    await expect(w.connect(bad.wallet)).rejects.toThrow('User rejected')
    expect(w.error.value).toBe('User rejected the request')
  })
})

describe('shortChainId', () => {
  it('maps the identifiers public nodes report to the short ids', () => {
    expect(shortChainId('69WiPg3DAQiwdxfncX6wYQ2siKwAe6L9BZthQea3JNMD')).toBe('4c78adac')
    expect(shortChainId('4btiuiMPvEENsttpZC7CZ53DruC3MAgfznDbASZ7DR6S')).toBe('35834a8a')
    expect(() => shortChainId('2')).toThrow(/unexpected chain identifier/)
  })
})
