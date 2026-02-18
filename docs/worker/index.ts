const GITHUB_API = 'https://api.github.com/repos/formkit/dmux';
const WAITLIST_API = 'https://agents.standardagentbuilder.com/api/waitlist';
const CACHE_TTL = 3600; // 1 hour in seconds

interface Env {
  WAITLIST_API_TOKEN: string;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/stars') {
      return handleStars(request);
    }

    if (url.pathname === '/api/early-access' && request.method === 'POST') {
      return handleEarlyAccess(request, env);
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

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

async function handleEarlyAccess(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as { name: string; email: string };
    if (!body.name || !body.email) {
      return Response.json({ error: 'Name and email required' }, { status: 400 });
    }

    const res = await fetch(WAITLIST_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.WAITLIST_API_TOKEN}`,
      },
      body: JSON.stringify({ email: body.email, name: body.name, source: 'dmux-docs' }),
    });

    if (!res.ok) {
      return Response.json({ error: 'Waitlist API error' }, { status: 502 });
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Failed to submit' }, { status: 500 });
  }
}
