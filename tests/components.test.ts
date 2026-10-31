// @vitest-environment jsdom
// Component tests for the wallet picker + connect modal: markup semantics, behaviour and axe.
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { installDialogShim } from '@meddleware/frontend-config/vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import * as axeMatchers from 'vitest-axe/matchers'
import type { Wallet } from '@mysten/wallet-standard'
import WalletSelector from '../src/WalletSelector.vue'
import WalletModal from '../src/WalletModal.vue'

expect.extend(axeMatchers)

// jsdom has no canvas: axe-core probes getContext() during some checks, and jsdom logs
// "Not implemented" before returning null. Return null up front — the same result axe already
// gets — so the noise goes away without changing what is tested.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
const opts = { rules: { region: { enabled: false } } }

beforeAll(installDialogShim)

const connect = vi.hoisted(() => vi.fn<(wallet: unknown) => Promise<void>>(async () => {}))
const walletError = vi.hoisted(() => ({ value: null as string | null }))
vi.mock('../src/wallet.js', async () => {
  const { ref } = await import('vue')
  return {
    useWallet: () => ({
      wallets: ref([{ name: 'Test Wallet', icon: 'data:image/png;base64,AA==' }]),
      connect,
      connecting: ref(false),
      error: ref(walletError.value),
    }),
  }
})

const WALLETS = [{ name: 'Alpha', icon: 'data:image/png;base64,AA==' }, { name: 'Beta' }] as unknown as Wallet[]

describe('WalletSelector', () => {
  it('renders a <menu> of wallet buttons and emits the chosen wallet', async () => {
    const w = mount(WalletSelector, { props: { wallets: WALLETS } })
    expect(w.find('menu').exists()).toBe(true)
    const buttons = w.findAll('menu > li > button')
    expect(buttons.map((b) => b.text())).toEqual(['Alpha', 'Beta'])
    // Decorative icon: the wallet name is already the button's text.
    expect(w.find('img').attributes('alt')).toBe('')
    await buttons[1].trigger('click')
    expect(w.emitted('select')?.[0]?.[0]).toEqual(WALLETS[1])
    expect(await axe(w.html(), opts)).toHaveNoViolations()
  })

  it('renders only Wallet Standard data-URI icons', () => {
    const wallets = [
      { name: 'Data', icon: 'data:image/svg+xml;base64,PHN2Zy8+' },
      { name: 'Remote', icon: 'https://tracker.example/pixel.png' },
      { name: 'Script', icon: 'javascript:alert(1)' },
    ] as unknown as Wallet[]
    const w = mount(WalletSelector, { props: { wallets } })
    const imgs = w.findAll('img')
    expect(imgs).toHaveLength(1)
    expect(imgs[0].attributes('src')).toBe('data:image/svg+xml;base64,PHN2Zy8+')
  })

  it('shows a paragraph (not a list) when no wallet is installed', async () => {
    const w = mount(WalletSelector, { props: { wallets: [] } })
    expect(w.find('menu').exists()).toBe(false)
    expect(w.find('p').text()).toContain('No Sui wallet detected')
    expect(await axe(w.html(), opts)).toHaveNoViolations()
  })
})

describe('WalletModal connection errors', () => {
  it('stays open and shows the reason when the wallet rejects, instead of failing silently', async () => {
    connect.mockClear()
    connect.mockRejectedValueOnce(new Error('User rejected the request'))
    walletError.value = 'User rejected the request'
    try {
      const w = mount(WalletModal, { attachTo: document.body })
      await w.get('button').trigger('click')
      await w.find('menu button').trigger('click')
      await nextTick()
      await nextTick()
      expect(w.find('dialog[open]').exists()).toBe(true)
      expect(w.find('[role="alert"]').text()).toContain('User rejected the request')
      expect(await axe(w.html(), opts)).toHaveNoViolations()
      w.unmount()
    } finally {
      walletError.value = null
    }
  })
})

describe('WalletModal', () => {
  it('opens the dialog from the trigger and closes after connecting', async () => {
    const w = mount(WalletModal, { attachTo: document.body })
    expect(w.find('dialog[open]').exists()).toBe(false)
    await w.get('button').trigger('click')
    expect(w.find('dialog[open]').exists()).toBe(true)
    expect(w.find('h2').text()).toBe('Select wallet')
    expect(await axe(w.html(), opts)).toHaveNoViolations()

    await w.find('menu button').trigger('click')
    await nextTick()
    await nextTick()
    expect(connect).toHaveBeenCalledOnce()
    expect(w.find('dialog[open]').exists()).toBe(false)
    w.unmount()
  })
})


describe('WalletModal as a component', () => {
  it('forwards attributes to its trigger (it has two top-level elements, so nothing falls through by itself)', () => {
    const w = mount(WalletModal, { attrs: { class: 'mine', 'data-testid': 'connect' }, attachTo: document.body })
    const trigger = w.get('button')
    expect(trigger.classes()).toContain('mine')
    expect(trigger.attributes('data-testid')).toBe('connect')
    w.unmount()
  })

  it('takes its label, and can stretch the trigger to its container', () => {
    const w = mount(WalletModal, { props: { label: 'Link a wallet', block: true }, attachTo: document.body })
    expect(w.get('button').text()).toBe('Link a wallet')
    expect(w.get('button').classes()).toContain('wm-block')
    expect(mount(WalletModal).get('button').classes()).not.toContain('wm-block')
    w.unmount()
  })

  it('announces a connection in progress through an always-mounted status region', () => {
    const w = mount(WalletModal, { attachTo: document.body })
    expect(w.find('output').exists()).toBe(true)
    w.unmount()
  })
})
