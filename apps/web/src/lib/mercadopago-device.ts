const scriptId = 'mercadopago-checkout-security'
const deviceIdPattern = /^[A-Za-z0-9_-]{1,256}$/
let loading: Promise<string> | undefined

export function readMercadoPagoDeviceId(value: unknown): string | undefined {
  return typeof value === 'string' && deviceIdPattern.test(value) ? value : undefined
}

// Loaded only on the payment page, with the provider's documented checkout view.
export function prepareMercadoPagoDeviceId(): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Payment preparation unavailable'))
  }
  const browser = window as Window & { MP_DEVICE_SESSION_ID?: unknown }
  const existingId = readMercadoPagoDeviceId(browser.MP_DEVICE_SESSION_ID)
  if (existingId) return Promise.resolve(existingId)
  if (loading) return loading

  loading = new Promise<string>((resolve, reject) => {
    let script = document.getElementById(scriptId) as HTMLScriptElement | null
    const fresh = !script
    if (!script) {
      script = document.createElement('script')
      script.id = scriptId
      script.src = 'https://www.mercadopago.com/v2/security.js'
      script.async = true
      script.setAttribute('view', 'checkout')
    }
    const securityScript = script
    function finish(id?: string) {
      window.clearTimeout(timeout)
      window.clearInterval(poll)
      securityScript.removeEventListener('error', failed)
      if (id) resolve(id)
      else {
        securityScript.remove()
        reject(new Error('Payment preparation unavailable'))
      }
    }
    function failed() { finish() }
    const timeout = window.setTimeout(() => finish(), 5_000)
    const poll = window.setInterval(() => {
      const id = readMercadoPagoDeviceId(browser.MP_DEVICE_SESSION_ID)
      if (id) finish(id)
    }, 100)
    securityScript.addEventListener('error', failed, { once: true })
    if (fresh) document.head.appendChild(securityScript)
  }).finally(() => { loading = undefined })
  return loading
}
