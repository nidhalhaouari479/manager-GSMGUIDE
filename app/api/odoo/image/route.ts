import { NextRequest, NextResponse } from 'next/server';

const ODOO_URL = (process.env.NEXT_PUBLIC_ODOO_URL || 'http://localhost:8069').replace(/\/+$/, '');

/**
 * GET /api/odoo/image?session_id=<id>&id=<productId> — a product thumbnail (image_128) proxied from Odoo,
 * so list pages can lazy-load images instead of embedding base64 in the JSON.
 * Returns 404 when the product has no image.
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id');
  const id = parseInt(request.nextUrl.searchParams.get('id') || '', 10);
  if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 401 });
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    // placeholder=false makes Odoo answer 404 instead of its generic placeholder picture
    const res = await fetch(`${ODOO_URL}/web/image/product.product/${id}/image_128?placeholder=false`, {
      headers: { Cookie: `session_id=${sessionId}` },
    });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.startsWith('image/')) {
      return new NextResponse(null, { status: 404 });
    }
    return new NextResponse(await res.arrayBuffer(), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
