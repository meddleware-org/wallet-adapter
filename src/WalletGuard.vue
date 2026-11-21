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

// Only the account matters here: any connected wallet lets the tool through, whichever tool connected it.
const { account } = useWallet()
// Template: the default slot when connected; otherwise a card with the message and a block-width connect button (WalletModal). The card is a
// UiCard, which keeps the splash a titled-surface element; `block` stretches the trigger to the card's width. No comment is placed before the root.
</script>

<template>
  <slot v-if="account" />
  <UiCard v-else class="wg-splash">
    <p class="wg-message">{{ message }}</p>
    <WalletModal block :required-features="requiredFeatures" />
  </UiCard>
</template>

<style scoped>
/* A centred, narrow card in the middle of the page (the tool's width, so the splash does not stretch across a wide console). */
.wg-splash {
  /* A column: the message, then the button, centred, with a gap between. */
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
/* The message is secondary to the button, so it is muted (AAA) and has no margin of its own (the card's gap spaces it). */
.wg-message {
  color: var(--muted);
  margin: 0;
}
</style>
