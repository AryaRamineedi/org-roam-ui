import { DEFAULT_HTTP_BASE_URL } from '../connection/config'

const cache = new Map<string, Promise<string>>()

/**
 * Fetches the raw org text for a node from Emacs's `GET /node/:id` servlet
 * (org-ascipio.el), caching in-flight/completed requests per node id for
 * the lifetime of the page. There's no cache invalidation on graph updates
 * yet -- acceptable for now since note bodies changing while the sidebar is
 * open is rare, but worth revisiting once diffed graph updates land.
 */
export function fetchNodeText(id: string): Promise<string> {
  const cached = cache.get(id)
  if (cached) return cached

  const promise = fetch(`${DEFAULT_HTTP_BASE_URL}/node/${encodeURIComponent(id)}`)
    .then((response) => {
      if (!response.ok) throw new Error(`GET /node/${id} -> ${response.status}`)
      return response.text()
    })
    .catch((error) => {
      cache.delete(id)
      throw error
    })

  cache.set(id, promise)
  return promise
}
