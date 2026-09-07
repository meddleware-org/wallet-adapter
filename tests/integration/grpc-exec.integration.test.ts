// gRPC execution-path integration harness — validates the exact core API that buildExecutor uses
// (`client.core.executeTransaction` + `waitForTransaction`) against a REAL Sui gRPC full node.
//
// A browser wallet can't run headless, so this signs with a faucet-funded ephemeral keypair
// instead of the wallet extension — the signing source differs, but the gRPC execute+wait path
// under test is identical to buildExecutor's. Gated by GRPC_TESTNET (self-skips otherwise):
//
//   GRPC_TESTNET=1 npm run test:integration
import { describe, it, expect } from 'vitest'
import { SuiGrpcClient } from '@mysten/sui/grpc'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Transaction } from '@mysten/sui/transactions'
import { getFaucetHost, requestSuiFromFaucetV2 } from '@mysten/sui/faucet'
import { fromBase64 } from '@mysten/sui/utils'

const RUN = !!process.env.GRPC_TESTNET
const BASE_URL = process.env.GRPC_TESTNET_URL || 'https://fullnode.testnet.sui.io:443'
const NETWORK = (process.env.GRPC_TESTNET_NETWORK || 'testnet') as 'testnet' | 'localnet'
// A pre-funded key (bech32 `suiprivkey…`) avoids the shared testnet faucet's rate limit and is the
// reliable way to run this in CI. Without it, the test best-effort requests from the faucet.
const FUNDED_KEY = process.env.WALLET_ADAPTER_FUNDED_KEY

describe.skipIf(!RUN)('gRPC execution-path (real full node)', () => {
  it('builds → signs → core.executeTransaction → waitForTransaction returns a finalized digest', async () => {
    const client = new SuiGrpcClient({ network: NETWORK, baseUrl: BASE_URL })
    const keypair = FUNDED_KEY ? Ed25519Keypair.fromSecretKey(FUNDED_KEY) : Ed25519Keypair.generate()
    const address = keypair.toSuiAddress()

    // Ensure the address has a gas coin. With a pre-funded key it should already; otherwise
    // best-effort faucet (shared testnet faucet is aggressively rate-limited — prefer a funded key
    // or localnet, whose faucet is unlimited).
    let funded = (await client.core.listOwnedObjects({ owner: address })).objects.length > 0
    if (!funded) {
      await requestSuiFromFaucetV2({ host: getFaucetHost(NETWORK === 'localnet' ? 'localnet' : 'testnet'), recipient: address })
      for (let i = 0; i < 20 && !funded; i++) {
        await new Promise((r) => setTimeout(r, 3000))
        funded = (await client.core.listOwnedObjects({ owner: address })).objects.length > 0
      }
    }
    expect(funded, 'address must be funded (set WALLET_ADAPTER_FUNDED_KEY or use localnet)').toBe(true)

    // A trivial self-transfer of a tiny amount — exercises build + sign + execute + wait.
    const tx = new Transaction()
    tx.setSender(address)
    const [coin] = tx.splitCoins(tx.gas, [1])
    tx.transferObjects([coin], address)
    const bytes = await tx.build({ client })
    const { signature } = await keypair.signTransaction(bytes)

    // The exact core calls buildExecutor makes (bytes here are already a Uint8Array; the wallet
    // path base64-decodes, hence fromBase64 in buildExecutor).
    void fromBase64 // referenced to document the wallet-path decode; keypair path passes bytes directly
    const res = await client.core.executeTransaction({ transaction: bytes, signatures: [signature] })
    const executed = res.$kind === 'Transaction' ? res.Transaction : res.FailedTransaction
    expect(executed.digest).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/) // base58 digest

    const waited = await client.core.waitForTransaction({ digest: executed.digest })
    const waitedTx = waited.$kind === 'Transaction' ? waited.Transaction : waited.FailedTransaction
    expect(waitedTx.digest).toBe(executed.digest)
  })
})
