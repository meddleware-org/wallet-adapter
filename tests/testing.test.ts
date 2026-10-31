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

const tool = createToolWallet({ requiredFeatures: ['sui:signTransaction'] })
const installed: { unregister(): void }[] = []
const install = (...a: Parameters<typeof installMockWallet>) => {
  const i = installMockWallet(...a)
  installed.push(i)
  return i
}

afterEach(async () => {
  await useWallet().disconnect()
  installed.splice(0).forEach((i) => i.unregister())
  for (const n of ['testnet', 'mainnet', 'localnet']) setSuiClientOverride(n, null)
  useNetwork().setNetwork('testnet')
  vi.restoreAllMocks()
})

describe('installMockWallet', () => {
  it('is found by the app as a real extension would be, and connects with the mock address', async () => {
    const { wallet } = install()
    const { wallets, connect, account } = tool.useWallet()
    expect(wallets.value.map((w) => w.name)).toContain('Test Wallet')
    await connect(wallets.value.find((w) => w.name === wallet.name)!)
    expect(account.value?.address).toBe(MOCK_ADDRESS)
  })

  it('leaves out a feature when asked, and the tool that needs it no longer lists the wallet', () => {
    install({ name: 'No tx signing', features: ['sui:signPersonalMessage'] })
    expect(tool.useWallet().wallets.value.map((w) => w.name)).not.toContain('No tx signing')
    expect(useWallet().wallets.value.map((w) => w.name)).toContain('No tx signing')
  })

  it('can be removed and put back, as an extension being disabled and enabled', () => {
    const i = install()
    expect(tool.useWallet().wallets.value.map((w) => w.name)).toContain('Test Wallet')
    i.unregister()
    expect(tool.useWallet().wallets.value.map((w) => w.name)).not.toContain('Test Wallet')
    i.register()
    expect(tool.useWallet().wallets.value.map((w) => w.name)).toContain('Test Wallet')
  })

  it('reports a rejected connection through the app’s own error state, and throws it to the caller', async () => {
    const { wallet } = install({ rejectConnect: 'User rejected the request' })
    const w = tool.useWallet()
    await expect(w.connect(w.wallets.value.find((x) => x.name === wallet.name)!)).rejects.toThrow('User rejected the request')
    expect(w.account.value).toBeNull()
    expect(w.error.value).toContain('User rejected the request')
  })
})

describe('signing', () => {
  async function connected(options: Parameters<typeof installMockWallet>[0] = {}) {
    const i = install(options)
    const w = tool.useWallet()
    await w.connect(w.wallets.value.find((x) => x.name === i.wallet.name)!)
    return w
  }

  it('signs a personal message with a canned signature by default', async () => {
    const w = await connected()
    const { signature } = await w.signPersonalMessage(new Uint8Array([1, 2, 3]))
    expect(Array.from(fromBase64(signature))).toEqual(Array.from(new TextEncoder().encode('mock')))
  })

  it('hands a personal message to a delegate as base64, and returns what it signs', async () => {
    const delegate = { signPersonalMessage: vi.fn(async () => ({ signature: 'c2lnbmVk' })) }
    const w = await connected({ delegate })
    expect((await w.signPersonalMessage(new Uint8Array([1, 2, 3]))).signature).toBe('c2lnbmVk')
    expect(delegate.signPersonalMessage).toHaveBeenCalledWith(toBase64(new Uint8Array([1, 2, 3])))
  })

  it('executes a transaction through the stub client and returns its digest', async () => {
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
    const [json, chain] = delegate.signTransaction.mock.calls[0] as unknown as [string, string]
    expect(JSON.parse(json).sender).toBe(MOCK_ADDRESS)
    expect(chain).toBe('sui:testnet')
    expect(executeTransaction).toHaveBeenCalledWith({ transaction: expect.objectContaining({ 0: 9, 1: 9, length: 2 }), signatures: ['c2ln'] })
  })

  it('refuses a chain the account does not list, as the real wallet module does', async () => {
    setSuiClientOverride('mainnet', createStubClient())
    const w = await connected({ chains: ['sui:testnet'] })
    useNetwork().setNetwork('mainnet')
    await expect(w.buildExecutor()).rejects.toThrow(/cannot sign for sui:mainnet/)
  })
})

describe('createStubClient', () => {
  it('lists the objects it was given, and none by default', async () => {
    const empty = createStubClient() as unknown as { listOwnedObjects(): Promise<{ objects: unknown[] }>; core: { listOwnedObjects(): Promise<{ objects: unknown[] }> } }
    expect((await empty.listOwnedObjects()).objects).toEqual([])
    const one = createStubClient({ owned: [{ objectId: '0x1' }] }) as unknown as typeof empty
    expect((await one.core.listOwnedObjects()).objects).toEqual([{ objectId: '0x1' }])
  })
})

describe('createStubClient balances', () => {
  it('lists the balances it was given, and none by default', async () => {
    type Balances = { core: { listBalances(): Promise<{ balances: unknown[]; hasNextPage: boolean }> } }
    expect((await (createStubClient() as unknown as Balances).core.listBalances()).balances).toEqual([])
    const held = createStubClient({ balances: [{ coinType: '0x2::sui::SUI' }] }) as unknown as Balances
    expect(await held.core.listBalances()).toMatchObject({ balances: [{ coinType: '0x2::sui::SUI' }], hasNextPage: false })
  })
})

describe('createStubClient objects', () => {
  it('reads an object by id, and fails for one it was not given, as a node does', async () => {
    const stub = createStubClient({ objects: { '0x1': { objectId: '0x1', json: { a: 1 } } } }) as unknown as { core: { getObject(a: { objectId: string }): Promise<{ object: unknown }> } }
    expect(await stub.core.getObject({ objectId: '0x1' })).toEqual({ object: { objectId: '0x1', json: { a: 1 } } })
    await expect(stub.core.getObject({ objectId: '0x2' })).rejects.toThrow(/not found/)
  })
})

describe('installE2eWallet', () => {
  it('registers the wallet, stubs the clients and exposes the hooks a test drives', async () => {
    const stub = createStubClient({ executed: okTransaction('D3') })
    const i = installE2eWallet({ client: stub })
    installed.push(i)
    const w = window as unknown as Record<string, () => void | string>
    expect(w.__e2eAddress).toBe(MOCK_ADDRESS)
    expect(tool.getSuiClient('testnet')).toBe(stub)
    expect(tool.getSuiClient('mainnet')).toBe(stub)
    w.__unregisterMockWallet!()
    expect(tool.useWallet().wallets.value.map((x) => x.name)).not.toContain('Test Wallet')
    w.__registerMockWallet!()
    expect(tool.useWallet().wallets.value.map((x) => x.name)).toContain('Test Wallet')
  })

  it('signs through the functions a Playwright test exposed (a signer in Node), when there are any', async () => {
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
