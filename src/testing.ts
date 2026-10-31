// Test doubles for the wallet and the chain, for component tests, end-to-end builds and screenshots. Not part of the production API:
// an app imports this only from its e2e entry, behind a build flag, so every other build drops it.
//
//   if (import.meta.env.MODE === 'e2e') (await import('@meddleware/wallet-adapter/testing')).installE2eWallet()
//
// The wallet is a real wallet-standard wallet (registered with `getWallets()`, so the app's own discovery, picker and connect flow run
// unchanged). Its signing is canned unless a `delegate` is given: a delegate receives the transaction as JSON (so a Playwright test can
// build and sign it in Node with a funded keypair, never putting a key in the page).
import { getWallets } from '@mysten/wallet-standard'
import type { Wallet, WalletAccount } from '@mysten/wallet-standard'
import type { SuiGrpcClient } from '@mysten/sui/grpc'
import { toBase64 } from '@mysten/sui/utils'
import type { Transaction } from '@mysten/sui/transactions'
import { setSuiClientOverride } from './wallet.js'

/** The address the mock wallet connects with unless told otherwise. */
export const MOCK_ADDRESS = `0x${'a'.repeat(64)}`

const ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const CANNED = toBase64(new TextEncoder().encode('mock'))

export interface MockDelegate {
  /** Build and sign a transaction. `transactionJson` is `await transaction.toJSON()`. Resolves the base64 bytes and signature. */
  signTransaction?(transactionJson: string, chain: string): Promise<{ bytes: string; signature: string }>
  /** Sign a personal message (`message` is its base64 bytes). */
  signPersonalMessage?(message: string): Promise<{ signature: string }>
}

export interface MockWalletOptions {
  /** Name in the picker (default `Test Wallet`). */
  name?: string
  /** Account address (default {@link MOCK_ADDRESS}). */
  address?: string
  /** Chains the wallet and its account support (default testnet, mainnet and localnet). */
  chains?: string[]
  /** Signing features to expose (default both). Leave one out to test an app that needs it. */
  features?: ('sui:signTransaction' | 'sui:signPersonalMessage')[]
  /** Sign for real (or differently) instead of returning canned values. */
  delegate?: MockDelegate
  /** Make `connect` fail with this message (a user rejecting the prompt). */
  rejectConnect?: string
}

/** A wallet-standard wallet. It is not registered: see {@link installMockWallet}. */
export function createMockWallet(options: MockWalletOptions = {}): Wallet {
  const { name = 'Test Wallet', address = MOCK_ADDRESS, chains = ['sui:testnet', 'sui:mainnet', 'sui:localnet'], delegate } = options
  const wanted = options.features ?? ['sui:signTransaction', 'sui:signPersonalMessage']
  const account = {
    address,
    publicKey: new Uint8Array(32),
    chains,
    features: wanted,
    label: 'Test',
    icon: undefined,
  } as unknown as WalletAccount
  const features: Record<string, unknown> = {
    'standard:connect': {
      version: '1.0.0',
      connect: async () => {
        if (options.rejectConnect) throw new Error(options.rejectConnect)
        return { accounts: [account] }
      },
    },
    // The app listens to the global registry's register/unregister events and to a connected wallet's `change`; nothing changes here.
    'standard:events': { version: '1.0.0', on: () => () => {} },
    'standard:disconnect': { version: '1.0.0', disconnect: async () => undefined },
  }
  if (wanted.includes('sui:signTransaction')) {
    features['sui:signTransaction'] = {
      version: '2.0.0',
      signTransaction: async (input: { transaction: Transaction; chain: string }) =>
        delegate?.signTransaction
          ? delegate.signTransaction(await input.transaction.toJSON(), input.chain)
          : { bytes: CANNED, signature: CANNED },
    }
  }
  if (wanted.includes('sui:signPersonalMessage')) {
    features['sui:signPersonalMessage'] = {
      version: '1.1.0',
      signPersonalMessage: async (input: { message: Uint8Array }) => {
        const message = toBase64(input.message)
        const { signature } = delegate?.signPersonalMessage ? await delegate.signPersonalMessage(message) : { signature: CANNED }
        return { bytes: message, signature }
      },
    }
  }
  return { version: '1.0.0', name, icon: ICON, chains, accounts: [], features } as unknown as Wallet
}

export interface InstalledMockWallet {
  wallet: Wallet
  address: string
  /** Register the wallet (done once on install; call again after `unregister`). */
  register(): void
  /** Remove the wallet from the registry, as an extension being disabled does. */
  unregister(): void
}

/** Create a mock wallet and register it with wallet-standard, so the app discovers it as it would a real extension. */
export function installMockWallet(options: MockWalletOptions = {}): InstalledMockWallet {
  const wallet = createMockWallet(options)
  const api = getWallets()
  let off: (() => void) | undefined
  const installed: InstalledMockWallet = {
    wallet,
    address: options.address ?? MOCK_ADDRESS,
    register() {
      off ??= api.register(wallet)
    },
    unregister() {
      off?.()
      off = undefined
    },
  }
  installed.register()
  return installed
}

/** A transaction result in the gRPC client's shape: a success with `digest`, plus any extra fields (`effects`, `objectTypes`, …). */
export function okTransaction(digest: string, extra: Record<string, unknown> = {}): unknown {
  return { $kind: 'Transaction', Transaction: { digest, status: { success: true, error: null }, ...extra } }
}

export interface StubClientOptions {
  /** What `executeTransaction` and `waitForTransaction` resolve (default {@link okTransaction} with a fixed digest). */
  executed?: unknown
  /** Objects `listOwnedObjects` returns (default none). */
  owned?: unknown[]
  /** Balances `core.listBalances` returns, as `{ coinType }` (default none). */
  balances?: { coinType: string }[]
  /** Objects `core.getObject` returns by id (`{ object }`); an id that is not here throws, as a node does for a missing object. */
  objects?: Record<string, unknown>
}

/**
 * A stand-in for the gRPC client. gRPC-web responses are binary, so they cannot be faked at the fetch layer; the app is given this
 * client instead (see {@link installE2eWallet}). It covers what the apps call: execute, wait, list owned objects and read objects by id.
 */
export function createStubClient(options: StubClientOptions = {}): SuiGrpcClient {
  const executed = options.executed ?? okTransaction(`E2E${'a'.repeat(41)}`)
  const list = async () => ({ objects: options.owned ?? [], hasNextPage: false, cursor: null })
  const listBalances = async () => ({ balances: options.balances ?? [], hasNextPage: false, cursor: null })
  const getObject = async ({ objectId }: { objectId: string }) => {
    const object = options.objects?.[objectId]
    if (object === undefined) throw new Error(`Object ${objectId} not found`)
    return { object }
  }
  return {
    executeTransaction: async () => executed,
    waitForTransaction: async () => executed,
    listOwnedObjects: list,
    core: { listOwnedObjects: list, listBalances, getObject },
  } as unknown as SuiGrpcClient
}

export interface E2eOptions extends MockWalletOptions {
  /** The stub client for every network (default {@link createStubClient}). Pass `null` to leave the real client. */
  client?: SuiGrpcClient | null
  /** Networks to stub (default testnet and mainnet). */
  networks?: string[]
}

/**
 * Everything an end-to-end build needs: the mock wallet registered (signing through the test's Node signer when it exposed one), the
 * stub client set for each network, and hooks on `window` for a test to drive (`__e2eAddress`, `__registerMockWallet`,
 * `__unregisterMockWallet`).
 */
export function installE2eWallet(options: E2eOptions = {}): InstalledMockWallet {
  const w = window as unknown as Record<string, unknown>
  // A Playwright test can sign in Node (`exposeSigner` from @meddleware/frontend-config/wallet): use its functions when they exist.
  const exposed = { signTransaction: w.__e2eSignTransaction, signPersonalMessage: w.__e2eSignPersonalMessage } as MockDelegate
  const delegate = options.delegate ?? (exposed.signTransaction || exposed.signPersonalMessage ? exposed : undefined)
  // ...and connect as the signer's own address, when the test said which that is.
  const address = options.address ?? (typeof w.__e2eWalletAddress === 'string' ? w.__e2eWalletAddress : undefined)
  const installed = installMockWallet({ ...options, address, delegate })
  if (options.client !== null) {
    const client = options.client ?? createStubClient()
    for (const network of options.networks ?? ['testnet', 'mainnet']) setSuiClientOverride(network, client)
  }
  w.__e2eAddress = installed.address
  w.__registerMockWallet = installed.register
  w.__unregisterMockWallet = installed.unregister
  return installed
}
