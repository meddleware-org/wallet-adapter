<script setup lang="ts">
// Presentational wallet picker — renders one button per discovered wallet extension.
// Callers own the connect logic; this component only emits which wallet was chosen.
import { computed } from 'vue'
import type { Wallet } from '@mysten/wallet-standard'
import { UiButton, UiNotice } from '@meddleware/ui'
import { safeIcon } from '@meddleware/web-utils'

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
</script>

<template>
  <!-- A list of commands (one per wallet) — or, when none are installed, a single message. The wallet's icon is supplied by whatever
       extension registered it, so it is bound only through `safeIcon` (a Wallet Standard image data URI, or nothing). -->
  <div class="ws">
    <UiNotice v-if="duplicateNames.length" type="warning">
      Several wallets are named {{ duplicateNames.map((n) => `“${n}”`).join(', ') }}. Check your browser extensions
      before choosing one.
    </UiNotice>
    <menu v-if="wallets.length" class="ws-list">
      <li v-for="(w, i) in wallets" :key="`${i}:${w.name}`">
        <UiButton variant="ghost" class="ws-option" @click="emit('select', w)">
          <img v-if="safeIcon(w.icon)" :src="safeIcon(w.icon)" alt="" class="ws-icon" />
          {{ w.name }}
        </UiButton>
      </li>
    </menu>
    <UiNotice v-else>No Sui wallet detected. Install a wallet extension to continue.</UiNotice>
  </div>
</template>

<style scoped>
.ws {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  width: 100%;
}
.ws-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  width: 100%;
  list-style: none;
  padding: 0;
  margin: 0;
}
/* The wallet's name and icon, left-aligned across the full width of the row. */
.ws-list :deep(.ws-option) {
  justify-content: flex-start;
  width: 100%;
  gap: var(--space-xs);
}
.ws-icon {
  width: var(--space-sm);
  height: var(--space-sm);
  object-fit: contain;
  flex-shrink: 0;
  border-radius: var(--radius-xs);
}
</style>
