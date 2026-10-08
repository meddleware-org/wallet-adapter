// The RPC chain-identifier check against the REAL public nodes: the id a node reports must map to
// the short id buildExecutor compares with. (A mocked client once hid a wrong format here.)
//   GRPC_TESTNET=1 npm run test:integration
import { describe, it, expect } from 'vitest'
import { getSuiClient, shortChainId } from '../../src/wallet.js'

const RUN = !!process.env.GRPC_TESTNET

describe.skipIf(!RUN)('chain identifier (live)', () => {
  for (const [network, url, short] of [
    ['testnet', 'https://fullnode.testnet.sui.io:443', '4c78adac'],
    ['mainnet', 'https://fullnode.mainnet.sui.io:443', '35834a8a'],
  ] as const) {
    it(`${network}: the node's identifier maps to ${short}`, async () => {
      const { chainIdentifier } = await getSuiClient(network, url).core.getChainIdentifier()
      expect(shortChainId(chainIdentifier)).toBe(short)
    })
  }
})
