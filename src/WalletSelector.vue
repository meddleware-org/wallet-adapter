<script setup lang="ts">
// Presentational wallet picker — renders one button per discovered wallet extension.
// Callers own the connect logic; this component only emits which wallet was chosen.
import type { Wallet } from '@mysten/wallet-standard'

defineProps<{ wallets: readonly Wallet[] }>()
const emit = defineEmits<{ select: [wallet: Wallet] }>()

/**
 * The icon is supplied by whatever extension registered the wallet. The Wallet Standard defines it
 * as a `data:image/(svg+xml|webp|png|gif);base64,…` URI; anything else is not rendered.
 */
function safeIcon(icon: unknown): string | undefined {
  return typeof icon === 'string' && /^data:image\/(svg\+xml|webp|png|gif);base64,/i.test(icon) ? icon : undefined
}
</script>

<template>
  <!-- A list of commands (one per wallet) — or, when none are installed, a single message. -->
  <menu v-if="wallets.length" class="ws-list">
    <li v-for="w in wallets" :key="w.name">
      <button type="button" class="ws-option" @click="emit('select', w)">
        <img v-if="safeIcon(w.icon)" :src="safeIcon(w.icon)" alt="" class="ws-icon" />
        {{ w.name }}
      </button>
    </li>
  </menu>
  <p v-else class="ws-empty">
    No Sui wallet detected. Install a wallet extension to continue.
  </p>
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
  background: var(--surface-hover, rgb(99 102 241 / 8%));
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
