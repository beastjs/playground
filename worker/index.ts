import { handleConverter } from '../src/lib/api/converter'

/**
 * Cloudflare Worker entry. `wrangler.jsonc` sends only `/api/*` here
 * (`run_worker_first`); every other path is served from `dist/` without
 * invoking the Worker at all.
 */

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    try {
      if (pathname === '/api/converter') return await handleConverter(request)
      if (pathname.startsWith('/api/')) return Response.json({ error: 'Not found.' }, { status: 404 })
    } catch (error) {
      console.error(error)
      return Response.json({ error: 'Internal error.' }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } })
    }
    return env.ASSETS.fetch(request)
  }
}
