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
      'Cookie': `session_id=${sessionId}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Odoo returned ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.data?.message || data.error.message || 'Odoo RPC Error');
  }

  return data.result;
}

async function fetchAllCustomers(domain: any[], sessionId: string) {
  const batchSize = 1000;
  const allCustomers: any[] = [];
  let offset = 0;

  while (true) {
    const batch = await odooRPC(
      '/web/dataset/call_kw',
      {
        model: 'res.partner',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: ['id', 'name', 'phone', 'mobile', 'email', 'street', 'city', 'state_id', 'country_id', 'vat', 'barcode', 'active'],
          limit: batchSize,
          offset,
          order: 'id asc',
        },
      },
      sessionId
    );

    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    allCustomers.push(...batch);

    if (batch.length < batchSize) {
      break;
    }

    offset += batchSize;
  }

  return allCustomers;
}

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('session_id');
    if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 401 });

    const all = request.nextUrl.searchParams.get('all') === 'true';
    const domain: any[] = [['customer_rank', '>', 0]];
    if (!all) domain.push(['active', '=', true]);

    const customers = await fetchAllCustomers(domain, sessionId);

    return NextResponse.json({
      success: true,
      customers: customers || [],
      total: customers?.length || 0,
    });
  } catch (error: any) {
    console.error('Customers proxy error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch customers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing session_id parameter' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, phone, mobile, email, street, city, vat } = body;

    if (!name) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    }

    const vals: Record<string, any> = { name, is_company: false, customer_rank: 1 };
    if (phone) vals.phone = phone;
    if (mobile) vals.mobile = mobile;
    if (email) vals.email = email;
    if (street) vals.street = street;
    if (city) vals.city = city;
    if (vat) vals.vat = vat;

    const newCustomerId = await odooRPC(
      '/web/dataset/call_kw',
      { model: 'res.partner', method: 'create', args: [[vals]], kwargs: {} },
      sessionId
    );

    // Fetch the newly created customer to return it
    const newCustomerList = await odooRPC(
      '/web/dataset/call_kw',
      {
        model: 'res.partner',
        method: 'read',
        args: [newCustomerId],
        kwargs: {
          fields: ['id', 'name', 'phone', 'mobile', 'email', 'street', 'city', 'state_id', 'country_id', 'vat', 'barcode'],
        },
      },
      sessionId
    );

    const newCustomer = newCustomerList && newCustomerList.length > 0 ? newCustomerList[0] : null;

    return NextResponse.json({
      success: true,
      customer: newCustomer,
    });
  } catch (error: any) {
    console.error('Customer create error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create customer' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('session_id');
    if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 401 });

    const body = await request.json();
    const { id, name, phone, email, active } = body;

    if (!id) return NextResponse.json({ error: 'Customer id is required' }, { status: 400 });

    const vals: Record<string, any> = {};
    if (name !== undefined) vals.name = name;
    if (phone !== undefined) vals.phone = phone || false;
    if (email !== undefined) vals.email = email || false;
    if (active !== undefined) vals.active = active;

    await odooRPC(
      '/web/dataset/call_kw',
      {
        model: 'res.partner',
        method: 'write',
        args: [[parseInt(id)], vals],
        kwargs: {},
      },
      sessionId
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Customer update error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update customer' }, { status: 500 });
  }
}
