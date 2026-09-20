<script setup lang="ts">
// Presentational wallet picker — renders one button per discovered wallet extension.
// Callers own the connect logic; this component only emits which wallet was chosen.
import type { Wallet } from '@mysten/wallet-standard'

defineProps<{ wallets: readonly Wallet[] }>()
const emit = defineEmits<{ select: [wallet: Wallet] }>()
</script>

<template>
  <ul class="ws-list">
    <li v-for="w in wallets" :key="w.name" class="ws-item">
      <button
        type="button"
        class="ws-option"
        @click="emit('select', w)"
      >
        <img v-if="w.icon" :src="(w.icon as string)" :alt="w.name" class="ws-icon" aria-hidden="true" />
        <span>{{ w.name }}</span>
      </button>
    </li>
    <p v-if="!wallets.length" class="ws-empty">
      No Sui wallet detected. Install a wallet extension to continue.
    </p>
  </ul>
</template>

<style scoped>
.ws-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  list-style: none;
  padding: 0;
  margin: 0;
}

.ws-item {
  display: contents;
}

.ws-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--surface, transparent);
  border: 1px solid var(--border, #333);
  border-radius: 8px;
  color: var(--text, inherit);
  font-size: 0.95rem;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.ws-option:hover {
  border-color: var(--accent, #6366f1);
  background: var(--surface-hover, rgba(99, 102, 241, 0.08));
}

.ws-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 4px;
}

.ws-empty {
  color: var(--muted, #888);
  font-size: 0.9rem;
  margin: 0;
}
</style>
