<script setup lang="ts">
// Renders its default slot when a wallet is connected; otherwise shows a centered splash with
// a WalletSelector so the user can choose which extension to connect.
// Uses the module-singleton useWallet() so connecting here reflects in every other tool view.
import type { Wallet } from '@mysten/wallet-standard'
import { useWallet } from './wallet.js'
import WalletSelector from './WalletSelector.vue'

withDefaults(defineProps<{
  /** Explanation shown above the wallet picker when not connected. */
  message?: string
}>(), {
  message: 'Connect a Sui wallet to continue.',
})

const { wallets, account, connect, connecting } = useWallet()

async function onSelect(w: Wallet): Promise<void> {
  await connect(w)
}
</script>

<template>
  <slot v-if="account" />
  <div v-else class="wg-splash">
    <p class="wg-message">{{ message }}</p>
    <WalletSelector :wallets="wallets" @select="onSelect" />
    <p v-if="connecting" class="wg-status">Connecting…</p>
  </div>
</template>

<style scoped>
.wg-splash {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  max-width: 360px;
  width: 100%;
  margin: 5rem auto;
  padding: 2rem;
  border: 1px solid var(--border, #333);
  border-radius: 12px;
  text-align: center;
}

.wg-message {
  color: var(--muted, #888);
  margin: 0;
  font-size: 0.95rem;
}

.wg-status {
  color: var(--muted, #888);
  font-size: 0.875rem;
  margin: 0;
}
</style>
