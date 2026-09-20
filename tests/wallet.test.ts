import { describe, it, expect } from 'vitest'
import { useWallet, getSuiClient, buildExecutor, digestFromExecuteResult } from '../src/wallet.js'

// The connect / sign paths require a real wallet extension injecting into `window`
// (wallet-standard's registry is window-based). Those are exercised manually in a browser.
// These unit tests cover the parts that are deterministic off a browser: the Sui client
// cache and the "connect first" guards on the signing operations.

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
