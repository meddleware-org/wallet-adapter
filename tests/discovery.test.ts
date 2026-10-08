// @vitest-environment jsdom
// Wallet discovery needs a window (the wallet-standard registry). One tool's feature requirement
// must never hide wallets from another tool.
import { describe, it, expect } from 'vitest'
import { getWallets } from '@mysten/wallet-standard'
import { useWallet } from '../src/wallet.js'

const mk = (name: string, personal: boolean) =>
  ({
    version: '1.0.0',
    name,
    icon: 'data:image/png;base64,AA==',
    chains: ['sui:testnet'],
    accounts: [],
    features: {
      'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: [] }) },
      'standard:events': { version: '1.0.0', on: () => () => {} },
      ...(personal ? { 'sui:signPersonalMessage': { version: '1.1.0', signPersonalMessage: async () => ({}) } } : {}),
    },
  }) as never

describe('per-caller feature filter', () => {
  it('filters only the caller that asked; the shared list keeps every connectable wallet', () => {
    const reg = getWallets()
    const off = [reg.register(mk('Alpha', false)), reg.register(mk('Beta', true))]
    try {
      const everyone = useWallet()
      const names = (w: { wallets: { value: readonly { name: string }[] } }) => w.wallets.value.map((x) => x.name)
      expect(names(everyone)).toEqual(expect.arrayContaining(['Alpha', 'Beta']))
      const picky = useWallet({ requiredFeatures: ['sui:signPersonalMessage'] })
      expect(names(picky)).toContain('Beta')
      expect(names(picky)).not.toContain('Alpha')
      // The first caller's list is unchanged by the second caller's requirement.
      expect(names(everyone)).toEqual(expect.arrayContaining(['Alpha', 'Beta']))
      // Wallets registered later appear for both, filtered per caller.
      const off2 = reg.register(mk('Gamma', false))
      off.push(off2)
      expect(names(everyone)).toContain('Gamma')
      expect(names(picky)).not.toContain('Gamma')
    } finally {
      off.forEach((u) => u())
    }
  })
})
