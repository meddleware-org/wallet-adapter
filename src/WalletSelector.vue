<script setup lang="ts">
// Presentational wallet picker — renders one button per discovered wallet extension.
// Callers own the connect logic; this component only emits which wallet was chosen.
import { computed } from 'vue'
import type { Wallet } from '@mysten/wallet-standard'
import { UiButton, UiNotice } from '@meddleware/ui'
import { safeIcon } from '@meddleware/web-utils'

const props = defineProps<{
  /** The wallets to offer, one button each (the caller decides which: see `requiredFeatures`). */
  wallets: readonly Wallet[]
}>()
// Emits only; the caller owns connecting. This component never calls the wallet itself.
const emit = defineEmits<{
  /** A wallet's button was pressed; the argument is that wallet. */
  select: [wallet: Wallet]
}>()

// Any extension can register a wallet with any name and icon, so two entries can look identical. The
// wallet's own confirmation is the real protection; this makes the ambiguity visible before a choice.
// The names that appear more than once: a look-alike wallet (one extension impersonating another) is shown as a warning, not hidden.
const duplicateNames = computed(() => {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const w of props.wallets) (seen.has(w.name) ? dup : seen).add(w.name)
  return [...dup]
})
// Template: a list of commands (one per wallet), or, when none are installed, a single message. The wallet's icon is supplied by whatever extension
// registered it, so it is bound only through `safeIcon` (a Wallet Standard image data URI, or nothing). The note is here, not before the template's
// root: an HTML comment there makes the component a fragment in a development build and breaks attribute fallthrough.
</script>

<template>
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
/* The picker as a vertical stack: an optional warning, then the wallet list (or the "no wallet" message), full width of the dialog. */
.ws {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  width: 100%;
}
/* A plain list of buttons: the browser's bullets and indent are removed because each wallet is its own button. */
.ws-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  width: 100%;
  /* The list resets below remove the browser defaults so only the gaps above space the buttons. */
  list-style: none;
  padding: 0;
  margin: 0;
}
/* The wallet's name and icon, left-aligned across the full width of the row. */
/* `:deep` because the button is UiButton's own element, which scoped styles would not otherwise reach. */
.ws-list :deep(.ws-option) {
  justify-content: flex-start;
  width: 100%;
  gap: var(--space-xs);
}
/* The wallet's icon, sized by a spacing token so it scales with the text and never distorts (contain). */
.ws-icon {
  width: var(--space-sm);
  height: var(--space-sm);
  object-fit: contain;
  flex-shrink: 0;
  border-radius: var(--radius-xs);
}
</style>
