/**
 * Cloudflare Pages Function - API Proxy
 *
 * Proxies all /api/* requests to the backend API server.
 * This enables same-origin requests from the frontend while keeping
 * the backend on a separate domain.
 */

interface Env {
  /**
   * Backend API URL - set in Cloudflare Pages environment variables
   * Use same name as local .env for consistency: VITE_API_BASE
   */
  VITE_API_BASE: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  const backendOrigin = env.VITE_API_BASE;
  if (!backendOrigin) {
    return new Response(
      JSON.stringify({ error: 'Configuration error', message: 'VITE_API_BASE not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Strip /api prefix and build backend URL
  const backendPath = url.pathname.replace(/^\/api/, '') || '/';
  const backendUrl = new URL(backendPath, backendOrigin);
  backendUrl.search = url.search;

  // Clone headers, removing host (will be set by fetch)
  const headers = new Headers(request.headers);
  headers.delete('host');

  // Add forwarding headers for the backend to know the original request info
  headers.set('X-Forwarded-Host', url.host);
  headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

  try {
    const response = await fetch(backendUrl.toString(), {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD'
        ? request.body
        : undefined,
      redirect: 'manual', // Don't follow redirects - pass them through
    });

    // Clone response headers
    const responseHeaders = new Headers(response.headers);

    // For redirects, rewrite Location header to use our proxy path
    const location = response.headers.get('Location');
    if (location && (response.status >= 300 && response.status < 400)) {
      try {
        const locationUrl = new URL(location, backendUrl);
        // If redirect is to our backend, rewrite to go through proxy
        if (locationUrl.origin === new URL(backendOrigin).origin) {
          responseHeaders.set('Location', `/api${locationUrl.pathname}${locationUrl.search}`);
        }
        // Otherwise keep external redirects as-is (e.g., OAuth to Google)
      } catch {
        // If Location is relative or invalid, leave it alone
      }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Proxy error:', error);

    return new Response(
      JSON.stringify({
        error: 'Proxy error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
