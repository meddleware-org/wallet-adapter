<script setup lang="ts">
// Single-trigger wallet connect modal: a button that opens the shared UiDialog with the wallet
// picker inside. Uses the module singleton so connecting here reflects everywhere.
import { ref } from 'vue'
import type { Wallet } from '@mysten/wallet-standard'
import { UiDialog } from '@meddleware/ui'
import { useWallet } from './wallet.js'
import WalletSelector from './WalletSelector.vue'

withDefaults(defineProps<{
  /** Label shown on the trigger button */
  label?: string
}>(), {
  label: 'Connect wallet',
})

const { wallets, connect, connecting } = useWallet()
const open = ref(false)

async function onSelect(w: Wallet): Promise<void> {
  await connect(w)
  open.value = false
}
</script>

<template>
  <button type="button" class="wm-trigger" @click="open = true">
    {{ label }}
  </button>

  <UiDialog v-model:open="open" title="Select wallet" width="min(360px, 90vw)">
    <WalletSelector :wallets="wallets" @select="onSelect" />
    <p v-if="connecting" class="wm-status" role="status">Connecting…</p>
  </UiDialog>
</template>

<style scoped>
.wm-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0.5rem 1rem;
  background: none;
  border: 1px solid var(--border, #444);
  border-radius: 999px;
  color: var(--muted, #aaa);
  font-size: 0.85rem;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.wm-trigger:hover {
  border-color: var(--accent, #6366f1);
  color: var(--text, #fff);
}

.wm-status {
  color: var(--muted, #888);
  font-size: 0.875rem;
  margin: 0;
  text-align: center;
}
</style>
