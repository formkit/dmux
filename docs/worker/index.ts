const GITHUB_API = 'https://api.github.com/repos/formkit/dmux';
const WAITLIST_API = 'https://agents.standardagentbuilder.com/api/waitlist';
const CACHE_TTL = 60; // 1 minute in seconds

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
  const cacheKey = new Request(new URL('/api/stars?v=2', request.url).toString());

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

    if (!env.WAITLIST_API_TOKEN) {
      console.error('[early-access] WAITLIST_API_TOKEN is not set');
      return Response.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    const res = await fetch(WAITLIST_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.WAITLIST_API_TOKEN}`,
      },
      body: JSON.stringify({ email: body.email, name: body.name, source: 'dmux-docs' }),
    });

    const responseBody = await res.text();
    console.log(`[early-access] upstream status=${res.status} body=${responseBody}`);

    if (!res.ok) {
      return Response.json({ error: 'Waitlist API error' }, { status: 502 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[early-access] error:', err);
    return Response.json({ error: 'Failed to submit' }, { status: 500 });
  }
}
