<script setup lang="ts">
// Single-trigger wallet connect modal: a button that opens the shared UiDialog with the wallet picker inside. Uses the module singleton,
// so connecting here reflects everywhere. Two top-level elements (the trigger and the dialog, which renders in the browser's top layer
// wherever it sits), so attributes are forwarded to the trigger explicitly rather than left to fall through.
import { ref } from 'vue'
import type { Wallet } from '@mysten/wallet-standard'
import { UiButton, UiDialog, UiLiveStatus, UiNotice } from '@meddleware/ui'
import { useWallet } from './wallet.js'
import WalletSelector from './WalletSelector.vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  /** Label shown on the trigger button */
  label?: string
  /** Stretch the trigger to the full width of its container. */
  block?: boolean
  /** Wallet-standard features the tool needs (`sui:signTransaction`): a wallet without one is not offered here. */
  requiredFeatures?: string[]
}>(), {
  label: 'Connect wallet',
  block: false,
  requiredFeatures: undefined,
})

const { wallets, connect, connecting, error } = useWallet(props.requiredFeatures ? { requiredFeatures: props.requiredFeatures } : {})
const open = ref(false)

async function onSelect(w: Wallet): Promise<void> {
  try {
    await connect(w)
    open.value = false
  } catch {
    // The reason (a rejected prompt, a locked wallet) is in `error`; the dialog stays open and shows it.
  }
}
</script>

<template>
  <UiButton v-bind="$attrs" variant="ghost" :class="{ 'wm-block': block }" @click="open = true">{{ label }}</UiButton>

  <UiDialog v-model:open="open" title="Select wallet">
    <WalletSelector :wallets="wallets" @select="onSelect" />
    <!-- Always mounted, so "Connecting…" is announced; an error is inserted as an alert, which is announced on arrival. -->
    <UiLiveStatus label="Wallet connection" :message="connecting ? 'Connecting…' : ''" />
    <UiNotice v-if="error && !connecting" type="error" :message="error" />
  </UiDialog>
</template>

<style scoped>
.wm-block {
  width: 100%;
}
</style>
