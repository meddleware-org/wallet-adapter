import { vueApp } from '@meddleware/frontend-config/eslint'

// The fleet's Vue + TypeScript + accessibility + browser-compat config. No chain boundary here: this package IS the boundary (it owns
// the wallet and the executor).
export default vueApp({ name: 'wallet-adapter' })
