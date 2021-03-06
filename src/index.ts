// `wrangler dev src/index.ts`

interface Env {
  BUCKET: R2Bucket
  AUTH_SECRET: string
}

export default {
  async fetch(
    request: Request,
    env: Env,
    event: FetchEvent
  ): Promise<Response> {
    const url = new URL(request.url)
    const key = url.pathname.slice(1)

    const token = request.headers
      .get('authorization')
      ?.replace('Bearer ', '')
      .trim()

    switch (request.method) {
      case 'PUT':
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

        const response = new Response(object.body, {
          headers: {
            'Cache-Control': 'public, max-age=31536000, immutable'
          }
        })
        event.waitUntil(cache.put(request, response.clone()))
        return response
      case 'DELETE':
        if (!token) {
          return new Response('Missing token', { status: 401 })
        }
        if (token !== env.AUTH_SECRET) {
          return new Response('Incorrect token', { status: 401 })
        }

        await env.BUCKET.delete(key)
        return new Response('Deleted!', { status: 200 })

      default:
        return new Response('Method Not Allowed', { status: 405 })
    }
  }
}
