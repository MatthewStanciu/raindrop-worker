/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

interface Env {
  BUCKET: R2Bucket
  AUTH_SECRET: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const key = url.pathname.slice(1)

    switch (request.method) {
      case 'PUT':
        const token = request.headers
          .get('authorization')
          ?.replace('Bearer ', '')
          .trim()

        if (!token) {
          return new Response('Missing token', { status: 401 })
        }
        if (token !== env.AUTH_SECRET) {
          return new Response('Incorrect token', { status: 401 })
        }

        const data = await request.formData()
        const file = data.get('file') as File

        await env.BUCKET.put(key, await file.arrayBuffer(), {
          httpMetadata: {
            contentType: file.type
          },
          customMetadata: {
            filename: file.name
          }
        })
        return new Response(`Put ${key} successfully!`)
      case 'GET':
        const cache = caches.default
        const cachedResponse = await cache.match(request)
        if (cachedResponse) {
          console.log('cached response!')
          return cachedResponse
        }

        const object = await env.BUCKET.get(key)
        if (!object) {
          return new Response('Object Not Found', { status: 404 })
        }

        return new Response(object.body, {
          headers: {
            'Cache-Control': 'public, max-age=31536000, immutable'
          }
        })
      case 'DELETE':
        await env.BUCKET.delete(key)
        return new Response('Deleted!', { status: 200 })

      default:
        return new Response('Method Not Allowed', { status: 405 })
    }
  }
}
