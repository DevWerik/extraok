export interface Env {
  API_ORIGIN: string
  ASSETS: { fetch(request: Request): Promise<Response> }
}

function proxyError(status: number, message: string): Response {
  return Response.json(
    { error: { code: 'INTERNAL_ERROR', message } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  )
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const incomingUrl = new URL(request.url)
    const isApi = incomingUrl.pathname === '/api' || incomingUrl.pathname.startsWith('/api/')
    const isHealth = incomingUrl.pathname === '/health' || incomingUrl.pathname === '/ready'

    if (!isApi && !isHealth) return env.ASSETS.fetch(request)

    let target: URL
    try {
      target = new URL(env.API_ORIGIN)
      if (
        target.protocol !== 'https:' ||
        target.username || target.password ||
        target.pathname !== '/' || target.search || target.hash ||
        target.origin === incomingUrl.origin
      ) {
        throw new Error('Invalid API origin')
      }
    } catch {
      return proxyError(500, 'A conexão com a API não está configurada corretamente.')
    }

    // Use only the configured origin; the incoming path/query cannot select another host.
    target.pathname = incomingUrl.pathname
    target.search = incomingUrl.search
    const upstreamRequest = new Request(target, request)
    for (const header of ['Host', 'Forwarded', 'X-Forwarded-For', 'X-Forwarded-Host', 'X-Forwarded-Proto', 'X-Real-IP']) {
      upstreamRequest.headers.delete(header)
    }
    // Preserve the browser's Origin and Cookie headers for the API's CSRF/session checks.

    try {
      const upstream = await fetch(upstreamRequest, { redirect: 'manual', cache: 'no-store' })
      const response = new Response(upstream.body, upstream)
      // Preserve status and Set-Cookie, including login/logout, without caching user data.
      response.headers.set('Cache-Control', 'no-store')
      return response
    } catch {
      // Never log request URLs, cookies or upstream errors: approval URLs contain tokens.
      return proxyError(502, 'Não foi possível conectar à API. Tente novamente em instantes.')
    }
  },
}
