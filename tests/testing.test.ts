// @vitest-environment jsdom
// The shared mock wallet, driven through the real wallet module and the real tool-wallet factory: it is discovered like an extension,
// connects, signs (canned or through a delegate), executes against the stub client, and can be removed and put back.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Transaction } from '@mysten/sui/transactions'
import { fromBase64, toBase64 } from '@mysten/sui/utils'
import { createToolWallet } from '../src/tool-wallet.js'
import { setSuiClientOverride, useWallet } from '../src/wallet.js'
import { useNetwork } from '../src/network.js'
import { MOCK_ADDRESS, createStubClient, installE2eWallet, installMockWallet, okTransaction } from '../src/testing.js'

// A tool that needs transaction signing, like most of the apps, so the mock's features are exercised through the real tool binding.
const tool = createToolWallet({ requiredFeatures: ['sui:signTransaction'] })
// Mock wallets installed by a test, removed afterwards so they do not appear in the next test's discovery.
const installed: { unregister(): void }[] = []
/** Install a mock wallet and remember it for cleanup. */
const install = (...a: Parameters<typeof installMockWallet>) => {
  const i = installMockWallet(...a)
  installed.push(i)
  return i
}

// Reset everything the mock touches: the connection, the registry, the stub clients, the selected network and the spies.
afterEach(async () => {
  await useWallet().disconnect()
  installed.splice(0).forEach((i) => i.unregister())
  for (const n of ['testnet', 'mainnet', 'localnet']) setSuiClientOverride(n, null)
  useNetwork().setNetwork('testnet')
  vi.restoreAllMocks()
})

// The mock is a real wallet-standard wallet: discovered, connected and removed through the app's own paths.
describe('installMockWallet', () => {
  it('is found by the app as a real extension would be, and connects with the mock address', async () => {
    const { wallet } = install()
    // The tool's own wallet list, so discovery is proved through the real registry rather than by asking the mock for itself.
    const { wallets, connect, account } = tool.useWallet()
    expect(wallets.value.map((w) => w.name)).toContain('Test Wallet')
    await connect(wallets.value.find((w) => w.name === wallet.name)!)
    expect(account.value?.address).toBe(MOCK_ADDRESS)
  })

  it('leaves out a feature when asked, and the tool that needs it no longer lists the wallet', () => {
    // A wallet that can only sign messages: the tool requires transaction signing, so it must be filtered out of the tool's list but not the full one.
    install({ name: 'No tx signing', features: ['sui:signPersonalMessage'] })
    expect(tool.useWallet().wallets.value.map((w) => w.name)).not.toContain('No tx signing')
    expect(useWallet().wallets.value.map((w) => w.name)).toContain('No tx signing')
  })

  it('can be removed and put back, as an extension being disabled and enabled', () => {
    const i = install()
    expect(tool.useWallet().wallets.value.map((w) => w.name)).toContain('Test Wallet')
    // Unregistering must remove it from the live list (the registry's own event), and registering must bring it back.
    i.unregister()
    expect(tool.useWallet().wallets.value.map((w) => w.name)).not.toContain('Test Wallet')
    i.register()
    expect(tool.useWallet().wallets.value.map((w) => w.name)).toContain('Test Wallet')
  })

  it('reports a rejected connection through the app’s own error state, and throws it to the caller', async () => {
    const { wallet } = install({ rejectConnect: 'User rejected the request' })
    // The mock rejects the way an extension does when the person clicks "Reject": the error reaches both the caller and the state.
    const w = tool.useWallet()
    await expect(w.connect(w.wallets.value.find((x) => x.name === wallet.name)!)).rejects.toThrow('User rejected the request')
    expect(w.account.value).toBeNull()
    expect(w.error.value).toContain('User rejected the request')
  })
})

// Signing through the mock: canned values by default, a delegate when given, and the real module's chain check unchanged.
describe('signing', () => {
  /** Install a mock wallet, connect it through the tool, and return the tool's wallet state. */
  async function connected(options: Parameters<typeof installMockWallet>[0] = {}) {
    const i = install(options)
    const w = tool.useWallet()
    await w.connect(w.wallets.value.find((x) => x.name === i.wallet.name)!)
    return w
  }

  it('signs a personal message with a canned signature by default', async () => {
    const w = await connected()
    // With no delegate the mock signs nothing real: the canned bytes "mock" prove the call reached it.
    const { signature } = await w.signPersonalMessage(new Uint8Array([1, 2, 3]))
    expect(Array.from(fromBase64(signature))).toEqual(Array.from(new TextEncoder().encode('mock')))
  })

  it('hands a personal message to a delegate as base64, and returns what it signs', async () => {
    // The delegate is what a Playwright test exposes from Node: it receives base64 because only strings cross the page boundary.
    const delegate = { signPersonalMessage: vi.fn(async () => ({ signature: 'c2lnbmVk' })) }
    const w = await connected({ delegate })
    expect((await w.signPersonalMessage(new Uint8Array([1, 2, 3]))).signature).toBe('c2lnbmVk')
    expect(delegate.signPersonalMessage).toHaveBeenCalledWith(toBase64(new Uint8Array([1, 2, 3])))
  })

  it('executes a transaction through the stub client and returns its digest', async () => {
    // The stub client stands in for the node that would execute the signed transaction.
    setSuiClientOverride('testnet', createStubClient({ executed: okTransaction('DIGEST1') }))
    const w = await connected()
    const executor = await w.buildExecutor()
    expect(await executor.signAndExecute(new Transaction())).toEqual({ digest: 'DIGEST1' })
  })

  it('hands a transaction to a delegate as JSON with its chain, and submits what the delegate signed', async () => {
    const executeTransaction = vi.fn(async () => okTransaction('DIGEST2'))
    setSuiClientOverride('testnet', { ...createStubClient(), executeTransaction } as never)
    const bytes = toBase64(new Uint8Array([9, 9]))
    const delegate = { signTransaction: vi.fn(async () => ({ bytes, signature: 'c2ln' })) }
    const w = await connected({ delegate })
    const tx = new Transaction()
    tx.setSender(MOCK_ADDRESS)
    await (await w.buildExecutor()).signAndExecute(tx)
    // The first call's arguments: the transaction as JSON (it has a sender) and the chain the wallet is asked to sign for.
    const [json, chain] = delegate.signTransaction.mock.calls[0] as unknown as [string, string]
    expect(JSON.parse(json).sender).toBe(MOCK_ADDRESS)
    expect(chain).toBe('sui:testnet')
    expect(executeTransaction).toHaveBeenCalledWith({ transaction: expect.objectContaining({ 0: 9, 1: 9, length: 2 }), signatures: ['c2ln'] })
  })

  // The mock account lists chains like a real one, so the real module's `assertAccountOnChain` is what refuses: nothing here is stubbed.
  it('refuses a chain the account does not list, as the real wallet module does', async () => {
    setSuiClientOverride('mainnet', createStubClient())
    const w = await connected({ chains: ['sui:testnet'] })
    useNetwork().setNetwork('mainnet')
    await expect(w.buildExecutor()).rejects.toThrow(/cannot sign for sui:mainnet/)
  })
})

// The stub client stands in for the gRPC client, whose binary responses cannot be faked at the fetch layer.
describe('createStubClient', () => {
  it('lists the objects it was given, and none by default', async () => {
    // The cast gives the two call shapes the apps use (`client.listOwnedObjects` and `client.core.listOwnedObjects`), which the stub's type leaves open.
    const empty = createStubClient() as unknown as { listOwnedObjects(): Promise<{ objects: unknown[] }>; core: { listOwnedObjects(): Promise<{ objects: unknown[] }> } }
    expect((await empty.listOwnedObjects()).objects).toEqual([])
    const one = createStubClient({ owned: [{ objectId: '0x1' }] }) as unknown as typeof empty
    expect((await one.core.listOwnedObjects()).objects).toEqual([{ objectId: '0x1' }])
  })
})

// The stub client's `core` API, which the apps call for balances and objects.
describe('createStubClient balances', () => {
  it('lists the balances it was given, and none by default', async () => {
    /** The shape of the one method this test calls. */
    type Balances = { core: { listBalances(): Promise<{ balances: unknown[]; hasNextPage: boolean }> } }
    expect((await (createStubClient() as unknown as Balances).core.listBalances()).balances).toEqual([])
    const held = createStubClient({ balances: [{ coinType: '0x2::sui::SUI' }] }) as unknown as Balances
    expect(await held.core.listBalances()).toMatchObject({ balances: [{ coinType: '0x2::sui::SUI' }], hasNextPage: false })
  })
})

// Reading an object by id: an id the stub was not given fails, as a node does for a missing object.
describe('createStubClient objects', () => {
  it('reads an object by id, and fails for one it was not given, as a node does', async () => {
    const stub = createStubClient({ objects: { '0x1': { objectId: '0x1', json: { a: 1 } } } }) as unknown as { core: { getObject(a: { objectId: string }): Promise<{ object: unknown }> } }
    expect(await stub.core.getObject({ objectId: '0x1' })).toEqual({ object: { objectId: '0x1', json: { a: 1 } } })
    await expect(stub.core.getObject({ objectId: '0x2' })).rejects.toThrow(/not found/)
  })
})

// The one-call install an end-to-end build uses: the wallet, the stub clients and the window hooks a Playwright test drives.
describe('installE2eWallet', () => {
  it('registers the wallet, stubs the clients and exposes the hooks a test drives', async () => {
    // One stub for every network, so the tool's client lookup can be compared by identity below.
    const stub = createStubClient({ executed: okTransaction('D3') })
    const i = installE2eWallet({ client: stub })
    installed.push(i)
    const w = window as unknown as Record<string, () => void | string>
    expect(w.__e2eAddress).toBe(MOCK_ADDRESS)
    expect(tool.getSuiClient('testnet')).toBe(stub)
    expect(tool.getSuiClient('mainnet')).toBe(stub)
    // The hooks a Playwright test calls to simulate the extension being disabled and enabled mid-test.
    w.__unregisterMockWallet!()
    expect(tool.useWallet().wallets.value.map((x) => x.name)).not.toContain('Test Wallet')
    w.__registerMockWallet!()
    expect(tool.useWallet().wallets.value.map((x) => x.name)).toContain('Test Wallet')
  })

  it('signs through the functions a Playwright test exposed (a signer in Node), when there are any', async () => {
    // The Node signer is exposed on `window` by the test; the global is deleted afterwards so it cannot leak into the next test.
    const w = window as unknown as Record<string, unknown>
    w.__e2eSignPersonalMessage = vi.fn(async () => ({ signature: 'Tm9kZQ==' }))
    try {
      installed.push(installE2eWallet({ client: null }))
      const tw = tool.useWallet()
      await tw.connect(tw.wallets.value.find((x) => x.name === 'Test Wallet')!)
      expect((await tw.signPersonalMessage(new Uint8Array([7]))).signature).toBe('Tm9kZQ==')
      expect(w.__e2eSignPersonalMessage).toHaveBeenCalledWith(toBase64(new Uint8Array([7])))
    } finally {
      delete w.__e2eSignPersonalMessage
    }
  })

  it('connects as the address a Node signer named', async () => {
    const w = window as unknown as Record<string, unknown>
    // An address no default uses, so the assertion cannot pass by accident.
    const own = `0x${'5'.repeat(64)}`
    w.__e2eWalletAddress = own
    try {
      const i = installE2eWallet({ client: null })
      installed.push(i)
      expect(i.address).toBe(own)
      expect((window as unknown as Record<string, string>).__e2eAddress).toBe(own)
      const tw = tool.useWallet()
      await tw.connect(tw.wallets.value.find((x) => x.name === 'Test Wallet')!)
      expect(tw.account.value?.address).toBe(own)
    } finally {
      delete w.__e2eWalletAddress
    }
  })

  it('leaves the real client alone when told to', () => {
    const before = tool.getSuiClient('testnet')
    installed.push(installE2eWallet({ client: null }))
    expect(tool.getSuiClient('testnet')).toBe(before)
  })
})

// The test-only hook (`setSuiClientOverride`) must be reachable from the testing entry and not from the production one.
describe('entries', () => {
  it('keeps the client override out of the production entry and in the testing entry', async () => {
    // Dynamic imports, so a failure to load either entry is a test failure and not a collection error.
    const entry = await import('../src/index.js')
    const testing = await import('../src/testing.js')
    expect('setSuiClientOverride' in entry).toBe(false)
    expect(typeof testing.setSuiClientOverride).toBe('function')
    expect('installE2eWallet' in entry).toBe(false)
    expect('createMockWallet' in entry).toBe(false)
  })
})
