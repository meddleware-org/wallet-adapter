<script setup lang="ts">
// Presentational wallet picker — renders one button per discovered wallet extension.
// Callers own the connect logic; this component only emits which wallet was chosen.
import { computed } from 'vue'
import type { Wallet } from '@mysten/wallet-standard'

const props = defineProps<{ wallets: readonly Wallet[] }>()
const emit = defineEmits<{ select: [wallet: Wallet] }>()

// Any extension can register a wallet with any name and icon, so two entries can look identical. The
// wallet's own confirmation is the real protection; this makes the ambiguity visible before a choice.
const duplicateNames = computed(() => {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const w of props.wallets) (seen.has(w.name) ? dup : seen).add(w.name)
  return [...dup]
})

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
  <p v-if="duplicateNames.length" class="ws-warning" role="note">
    Several wallets are named {{ duplicateNames.map((n) => `“${n}”`).join(', ') }}. Check your browser extensions
    before choosing one.
  </p>
  <menu v-if="wallets.length" class="ws-list">
    <li v-for="(w, i) in wallets" :key="`${i}:${w.name}`">
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
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 0.95rem;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.ws-option:hover {
  border-color: var(--accent);
  background: var(--lift);
}

.ws-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 4px;
}

.ws-warning {
  color: var(--warning-text);
  font-size: 0.85rem;
  margin: 0 0 0.75rem;
}

.ws-empty {
  color: var(--muted);
  font-size: 0.9rem;
  margin: 0;
}
</style>
