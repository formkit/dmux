const GITHUB_API = 'https://api.github.com/repos/formkit/dmux';
const CACHE_TTL = 3600; // 1 hour in seconds

export default {
  async fetch(request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/stars') {
      return handleStars(request);
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler;

async function handleStars(request: Request): Promise<Response> {
  const cache = caches.default;
  const cacheKey = new Request(new URL('/api/stars', request.url).toString());

  // Check cache first
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch from GitHub
  try {
    const res = await fetch(GITHUB_API, {
      headers: {
        'User-Agent': 'dmux-docs',
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      return Response.json({ error: 'GitHub API error' }, { status: 502 });
    }

    const data = (await res.json()) as { stargazers_count: number };
    const response = Response.json(
      { stars: data.stargazers_count },
      {
        headers: {
          'Cache-Control': `public, max-age=${CACHE_TTL}`,
          'Access-Control-Allow-Origin': '*',
        },
      }
    );

    // Store in Cloudflare cache
    await cache.put(cacheKey, response.clone());

    return response;
  } catch {
    return Response.json({ error: 'Failed to fetch stars' }, { status: 502 });
  }
}
