<script setup lang="ts">
// Single-trigger wallet connect modal: a button that opens the shared UiDialog with the wallet picker inside. Uses the module singleton,
// so connecting here reflects everywhere. Two top-level elements (the trigger and the dialog, which renders in the browser's top layer
// wherever it sits), so attributes are forwarded to the trigger explicitly rather than left to fall through.
import { ref } from 'vue'
import type { Wallet } from '@mysten/wallet-standard'
import { UiButton, UiDialog, UiLiveStatus, UiNotice } from '@meddleware/ui'
import { useWallet } from './wallet.js'
import WalletSelector from './WalletSelector.vue'

// Two roots (the trigger and the dialog), so Vue cannot choose where fallthrough attributes go: turn it off and forward them to the trigger.
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

// The shared wallet state, filtered to the wallets that have the features this tool needs (none given: everything connectable).
const { wallets, connect, connecting, error } = useWallet(props.requiredFeatures ? { requiredFeatures: props.requiredFeatures } : {})
// Whether the dialog is open (UiDialog's `v-model:open`).
const open = ref(false)

/**
 * The person chose a wallet: connect it and close the dialog on success.
 * @param w - the chosen wallet
 */
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
/* The `block` prop: the trigger button fills its container's width (the dialog itself is drawn in the top layer, so it needs no layout rule). */
.wm-block {
  width: 100%;
}
</style>
