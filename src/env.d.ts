// Type declarations the compiler needs but no source file provides: Vite's client types, and `.vue` files as components.
/// <reference types="vite/client" />

/** A `.vue` file imported from TypeScript is a component; its real types come from vue-tsc when the file is checked. */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
