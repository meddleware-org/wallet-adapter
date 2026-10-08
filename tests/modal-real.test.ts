// @vitest-environment jsdom
// The real modal → connect → error path, with the real wallet module (components.test.ts mocks it) and
// real registered wallets: a look-alike pair in the picker, a wallet that rejects, and the guard.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import * as axeMatchers from 'vitest-axe/matchers'
import { getWallets } from '@mysten/wallet-standard'
import WalletModal from '../src/WalletModal.vue'
import WalletGuard from '../src/WalletGuard.vue'
import WalletSelector from '../src/WalletSelector.vue'
import { useWallet } from '../src/wallet.js'

expect.extend(axeMatchers)
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
const opts = { rules: { region: { enabled: false } } }

// UiDialog from the prebuilt @meddleware/ui does not render under these jsdom tests (a second Vue copy);
// its own tests cover it. Stub it with the same structure.
vi.mock('@meddleware/ui', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    UiDialog: defineComponent({
      props: { open: Boolean, title: String, width: String },
      setup(props, { slots }) {
        return () =>
          props.open
            ? h('dialog', { open: true, 'aria-labelledby': 'dlg-title' }, [h('article', [h('header', [h('h2', { id: 'dlg-title' }, props.title)]), slots.default?.()])])
            : null
      },
    }),
  }
})

const fake = (name: string, connect: () => Promise<{ accounts: unknown[] }>) =>
  ({
    version: '1.0.0',
    name,
    icon: 'data:image/png;base64,AA==',
    chains: ['sui:testnet'],
    accounts: [],
    features: {
      'standard:connect': { version: '1.0.0', connect },
      'standard:events': { version: '1.0.0', on: () => () => {} },
    },
  }) as never

describe('WalletModal with the real wallet module', () => {
  const unregister: (() => void)[] = []
  afterEach(() => {
    unregister.splice(0).forEach((u) => u())
    useWallet().disconnect?.()
  })

  it('shows a rejected connection in the modal, which stays open', async () => {
    unregister.push(getWallets().register(fake('Impostor', async () => { throw new Error('impostor refused') })))
    const w = mount(WalletModal, { attachTo: document.body })
    await w.find('button.wm-trigger').trigger('click')
    const buttons = w.findAll('menu button')
    const impostor = buttons.find((b) => b.text().includes('Impostor'))
    expect(impostor).toBeDefined()
    await impostor!.trigger('click')
    await nextTick()
    await nextTick()
    expect(w.find('dialog').exists()).toBe(true)
    expect(w.find('[role="alert"]').text()).toContain('impostor refused')
    expect(await axe(w.html(), opts)).toHaveNoViolations()
    w.unmount()
  })
})

describe('WalletSelector look-alikes', () => {
  it('warns when two wallets share a name, and keys them apart', async () => {
    const wallets = [fake('Slush', async () => ({ accounts: [] })), fake('Slush', async () => ({ accounts: [] })), fake('Other', async () => ({ accounts: [] }))] as never[]
    const w = mount(WalletSelector, { props: { wallets } })
    const note = w.find('[role="note"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('“Slush”')
    expect(note.text()).not.toContain('Other')
    expect(w.findAll('menu button')).toHaveLength(3)
    expect(await axe(w.html(), opts)).toHaveNoViolations()
  })

  it('shows no warning when every name is distinct', () => {
    const w = mount(WalletSelector, { props: { wallets: [fake('A', async () => ({ accounts: [] })), fake('B', async () => ({ accounts: [] }))] as never[] } })
    expect(w.find('[role="note"]').exists()).toBe(false)
  })
})

describe('WalletGuard', () => {
  it('shows the connect splash while no account is connected', async () => {
    const w = mount(WalletGuard, { props: { message: 'Connect first.' }, slots: { default: '<p>secret panel</p>' } })
    expect(w.text()).toContain('Connect first.')
    expect(w.text()).not.toContain('secret panel')
    expect(await axe(w.html(), opts)).toHaveNoViolations()
  })
})
