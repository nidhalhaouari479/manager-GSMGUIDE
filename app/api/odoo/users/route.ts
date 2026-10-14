import { NextRequest, NextResponse } from 'next/server';

const ODOO_URL = process.env.NEXT_PUBLIC_ODOO_URL || 'http://localhost:8069';

async function odooRPC(endpoint: string, params: any, sessionId: string) {
  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params,
    id: Math.floor(Math.random() * 1_000_000_000),
  };
  const response = await fetch(`${ODOO_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `session_id=${sessionId}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Odoo returned ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error.data?.message || data.error.message || 'Odoo RPC Error');
  return data.result;
}

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('session_id');
    if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 401 });

    const all = request.nextUrl.searchParams.get('all') === 'true';

    // Get current session info to find the current user's company
    const sessionInfo = await odooRPC('/web/session/get_session_info', {}, sessionId);
    const companyId = sessionInfo.user_companies?.current_company || sessionInfo.company_id;

    if (!companyId) {
      return NextResponse.json({ error: 'Could not determine current user company' }, { status: 400 });
    }

    const domain: any[] = [['company_id', '=', companyId]];
    if (!all) {
      domain.push(['active', '=', true]);
    }

    const users = await odooRPC(
      '/web/dataset/call_kw',
      {
        model: 'res.users',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: ['id', 'name', 'login', 'email', 'active', 'company_id'],
          limit: 100,
          order: 'name asc',
        },
      },
      sessionId
    );

    return NextResponse.json({ success: true, users: users || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('session_id');
    if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 401 });

    const body = await request.json();
    const { name, login, password } = body;

    if (!name || !login || !password) {
      return NextResponse.json({ error: 'Name, login and password are required' }, { status: 400 });
    }

    // Get current company to assign to the new user
    const sessionInfo = await odooRPC('/web/session/get_session_info', {}, sessionId);
    const companyId = sessionInfo.user_companies?.current_company || sessionInfo.company_id;

    const vals: Record<string, any> = {
      name,
      login,
      password,
      active: true,
      company_id: companyId,
      company_ids: [[6, 0, [companyId]]], // Also set allowed companies
    };

    const newId = await odooRPC(
      '/web/dataset/call_kw',
      {
        model: 'res.users',
        method: 'create',
        args: [vals],
        kwargs: {},
      },
      sessionId
    );

    const created = await odooRPC(
      '/web/dataset/call_kw',
      {
        model: 'res.users',
        method: 'read',
        args: [[newId]],
        kwargs: {
          fields: ['id', 'name', 'login', 'email', 'active'],
        },
      },
      sessionId
    );

    return NextResponse.json({ success: true, user: created?.[0] || null });
  } catch (error: any) {
    console.error('User create error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create user' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('session_id');
    if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 401 });

    const body = await request.json();
    const { id, name, login, password, active } = body;

    if (!id) return NextResponse.json({ error: 'User id is required' }, { status: 400 });

    const vals: Record<string, any> = {};
    if (name !== undefined) vals.name = name;
    if (login !== undefined) vals.login = login;
    if (password !== undefined && password !== '') vals.password = password;
    if (active !== undefined) vals.active = active;

    await odooRPC(
      '/web/dataset/call_kw',
      {
        model: 'res.users',
        method: 'write',
        args: [[parseInt(id)], vals],
        kwargs: {},
      },
      sessionId
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('User update error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update user' }, { status: 500 });
  }
}
