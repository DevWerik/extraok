import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { prepareMercadoPagoDeviceId } from '../src/lib/mercadopago-device.ts'

function browserFixture(context: TestContext) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const attributes = new Map<string, string>()
  let inserted: EventTarget & { src: string; async: boolean } | undefined
  let additions = 0
  const browser = { setTimeout, clearTimeout, setInterval, clearInterval, MP_DEVICE_SESSION_ID: undefined as unknown }
  const document = {
    getElementById: () => inserted ?? null,
    createElement: () => Object.assign(new EventTarget(), {
      id: '', src: '', async: false,
      setAttribute: (key: string, value: string) => attributes.set(key, value),
      remove: () => { inserted = undefined },
    }),
    head: { appendChild: (script: typeof inserted) => { inserted = script; additions++ } },
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document })
  context.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  })
  return { browser, attributes, script: () => inserted, additions: () => additions }
}

test('checkout carrega apenas o script oficial, compartilha preparação e reutiliza o Device ID real', async (context) => {
  const f = browserFixture(context)
  const first = prepareMercadoPagoDeviceId()
  const second = prepareMercadoPagoDeviceId()
  assert.equal(first, second)
  assert.equal(f.additions(), 1)
  assert.equal(f.script()?.src, 'https://www.mercadopago.com/v2/security.js')
  assert.equal(f.script()?.async, true)
  assert.equal(f.attributes.get('view'), 'checkout')
  f.browser.MP_DEVICE_SESSION_ID = 'provider-device-session-123'
  assert.equal(await first, 'provider-device-session-123')
  assert.equal(await prepareMercadoPagoDeviceId(), 'provider-device-session-123')
  assert.equal(f.additions(), 1)
})

test('falha do script não inventa identificador e permite uma nova preparação', async (context) => {
  const f = browserFixture(context)
  const first = prepareMercadoPagoDeviceId()
  const rejected = assert.rejects(first, /Payment preparation unavailable/)
  f.script()!.dispatchEvent(new Event('error'))
  await rejected
  assert.equal(f.script(), undefined)
  const retry = prepareMercadoPagoDeviceId()
  f.browser.MP_DEVICE_SESSION_ID = 'provider-device-after-retry'
  assert.equal(await retry, 'provider-device-after-retry')
  assert.equal(f.additions(), 2)
})
