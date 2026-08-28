import { resolveApiOrigin } from '../../../lib/catalog';

const DEFAULT_API_URL = 'http://localhost:3001/api/v1';
const ASSET_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$/;

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await context.params;
  if (!ASSET_KEY.test(key)) return new Response(null, { status: 404 });

  try {
    const origin = resolveApiOrigin(
      process.env.API_INTERNAL_URL ?? DEFAULT_API_URL,
    );
    const upstream = await fetch(`${origin}/api/v1/product-assets/${key}`, {
      cache: 'force-cache',
      signal: AbortSignal.timeout(1_500),
    });
    if (upstream.status === 404) return new Response(null, { status: 404 });
    if (
      !upstream.ok ||
      !upstream.headers
        .get('content-type')
        ?.toLowerCase()
        .startsWith('image/webp')
    ) {
      return new Response(null, { status: 502 });
    }
    return new Response(upstream.body, {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': 'image/webp',
        'X-Content-Type-Options': 'nosniff',
      },
      status: 200,
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
