<script setup lang="ts">
// Renders its default slot when a wallet is connected; otherwise shows a centered splash with
// a single "Connect wallet" button that opens the WalletModal dialog.
// Uses the module-singleton useWallet() so connecting here reflects in every other tool view.
import { useWallet } from './wallet.js'
import WalletModal from './WalletModal.vue'

withDefaults(defineProps<{
  /** Explanation shown above the connect button when not connected. */
  message?: string
}>(), {
  message: 'Connect a Sui wallet to continue.',
})

const { account } = useWallet()
</script>

<template>
  <slot v-if="account" />
  <div v-else class="wg-splash">
    <p class="wg-message">{{ message }}</p>
    <WalletModal />
  </div>
</template>

<style scoped>
.wg-splash {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  max-width: 320px;
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
</style>
