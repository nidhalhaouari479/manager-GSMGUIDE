import { NextRequest, NextResponse } from 'next/server';

const ODOO_URL = process.env.NEXT_PUBLIC_ODOO_URL || 'http://localhost:8069';

async function odooRPC(endpoint: string, params: any, sessionId: string) {
  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params,
    id: Math.floor(Math.random() * 1000000000),
  };

  const response = await fetch(`${ODOO_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `session_id=${sessionId}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error(`Odoo returned ${response.status}`);

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.data?.message || data.error.message || 'Odoo RPC Error');
  }
  return data.result;
}

async function fetchAllInvoices(domain: any[], sessionId: string) {
  const batchSize = 1000;
  const allInvoices: any[] = [];
  let offset = 0;

  while (true) {
    const batch = await odooRPC(
      '/web/dataset/call_kw',
      {
        model: 'account.move',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: ['id', 'name', 'partner_id', 'invoice_date', 'amount_total', 'state', 'payment_state', 'create_uid'],
          order: 'invoice_date desc, id desc',
          limit: batchSize,
          offset,
        },
      },
      sessionId
    );

    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    allInvoices.push(...batch);

    if (batch.length < batchSize) {
      break;
    }

    offset += batchSize;
  }

  return allInvoices;
}

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('session_id');
    if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 401 });

    const startDate = request.nextUrl.searchParams.get('start_date');
    const endDate = request.nextUrl.searchParams.get('end_date');
    const search = request.nextUrl.searchParams.get('search');
    const creatorId = request.nextUrl.searchParams.get('creator_id');

    const domain: any[] = [['move_type', '=', 'out_invoice']];

    if (startDate) domain.push(['invoice_date', '>=', startDate]);
    if (endDate) domain.push(['invoice_date', '<=', endDate]);
    if (search) {
      domain.push(['|', ['name', 'ilike', search], ['ref', 'ilike', search]]);
    }
    if (creatorId) {
      domain.push(['create_uid', '=', parseInt(creatorId)]);
    }

    const invoices = await fetchAllInvoices(domain, sessionId);

    return NextResponse.json({ success: true, invoices: invoices || [], total: invoices?.length || 0 });
  } catch (error: any) {
    console.error('Invoices GET error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch invoices' }, { status: 500 });
  }
}
