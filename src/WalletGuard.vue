<script setup lang="ts">
// Renders its default slot when a wallet is connected; otherwise shows a centred splash with a single "Connect wallet" button that opens
// the WalletModal dialog. Uses the module-singleton useWallet() so connecting here reflects in every other tool view.
import { UiCard } from '@meddleware/ui'
import { useWallet } from './wallet.js'
import WalletModal from './WalletModal.vue'

withDefaults(defineProps<{
  /** Explanation shown above the connect button when not connected. */
  message?: string
  /** Wallet-standard features the tool needs; only wallets that have them are offered. */
  requiredFeatures?: string[]
}>(), {
  message: 'Connect a Sui wallet to continue.',
  requiredFeatures: undefined,
})

const { account } = useWallet()
</script>

<template>
  <slot v-if="account" />
  <UiCard v-else class="wg-splash">
    <p class="wg-message">{{ message }}</p>
    <WalletModal block :required-features="requiredFeatures" />
  </UiCard>
</template>

<style scoped>
.wg-splash {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  max-width: var(--mw-content-narrow);
  width: 100%;
  margin: var(--space-xl) auto;
  padding: var(--space-md);
  text-align: center;
}
.wg-message {
  color: var(--muted);
  margin: 0;
}
</style>
