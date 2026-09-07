<script setup lang="ts">
// Single-trigger wallet connect modal. Renders a button that opens a native <dialog> with the
// wallet picker inside. Uses the module singleton so connecting here reflects everywhere.
import { ref } from 'vue'
import type { Wallet } from '@mysten/wallet-standard'
import { useWallet } from './wallet.js'
import WalletSelector from './WalletSelector.vue'

withDefaults(defineProps<{
  /** Label shown on the trigger button */
  label?: string
}>(), {
  label: 'Connect wallet',
})

const { wallets, connect, connecting } = useWallet()
const dialogRef = ref<HTMLDialogElement | null>(null)

function show(): void { dialogRef.value?.showModal() }
function hide(): void { dialogRef.value?.close() }

async function onSelect(w: Wallet): Promise<void> {
  await connect(w)
  hide()
}
</script>

<template>
  <button type="button" class="wm-trigger" @click="show">
    {{ label }}
  </button>

  <Teleport to="body">
    <dialog ref="dialogRef" class="wm-dialog" @click.self="hide" @cancel.prevent="hide">
      <div class="wm-panel">
        <div class="wm-header">
          <span class="wm-title">Select wallet</span>
          <button type="button" class="wm-close" aria-label="Close" @click="hide">✕</button>
        </div>
        <WalletSelector :wallets="wallets" @select="onSelect" />
        <p v-if="connecting" class="wm-status">Connecting…</p>
      </div>
    </dialog>
  </Teleport>
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

/* ── Native dialog + backdrop ─────────────────────────── */
.wm-dialog {
  position: fixed;
  inset: 0;
  margin: auto;
  width: min(360px, 90vw);
  padding: 0;
  background: var(--surface-raised, #1e1e2e);
  border: 1px solid var(--border, #333);
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  color: var(--text, #f0f0f0);
}

.wm-dialog::backdrop {
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
}

.wm-panel {
  padding: 1.25rem 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.wm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.wm-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
}

.wm-close {
  background: none;
  border: none;
  color: var(--muted, #888);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 4px;
}

.wm-close:hover {
  color: var(--text, #fff);
}

.wm-status {
  color: var(--muted, #888);
  font-size: 0.875rem;
  margin: 0;
  text-align: center;
}
</style>
