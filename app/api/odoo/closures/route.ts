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
    headers: {
      'Content-Type': 'application/json',
      Cookie: `session_id=${sessionId}`,
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

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('session_id');
    const userId = request.nextUrl.searchParams.get('user_id');
    const date = request.nextUrl.searchParams.get('date');

    if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 401 });
    if (!userId) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    if (!date) return NextResponse.json({ error: 'Missing date' }, { status: 400 });

    const startDateTime = `${date} 00:00:00`;
    const endDateTime = `${date} 23:59:59`;
    const parsedUserId = parseInt(userId, 10);

    const [sessions, orders] = await Promise.all([
      odooRPC(
        '/web/dataset/call_kw',
        {
          model: 'pos.session',
          method: 'search_read',
          args: [[
            ['user_id', '=', parsedUserId],
            ['start_at', '>=', startDateTime],
            ['start_at', '<=', endDateTime],
          ]],
          kwargs: {
            fields: ['id', 'name', 'user_id', 'start_at', 'stop_at', 'state'],
            order: 'start_at asc',
          },
        },
        sessionId
      ),
      odooRPC(
        '/web/dataset/call_kw',
        {
          model: 'pos.order',
          method: 'search_read',
          args: [[
            ['user_id', '=', parsedUserId],
            ['date_order', '>=', startDateTime],
            ['date_order', '<=', endDateTime],
          ]],
          kwargs: {
            fields: ['id', 'name', 'pos_reference', 'date_order', 'amount_total', 'amount_tax', 'amount_paid', 'lines', 'user_id'],
            order: 'date_order asc',
            limit: 5000,
          },
        },
        sessionId
      ),
    ]);

    const orderIds = Array.isArray(orders) ? orders.map((order: any) => order.id) : [];
    const orderLineIds = Array.isArray(orders)
      ? orders.flatMap((order: any) => (Array.isArray(order.lines) ? order.lines : []))
      : [];

    const [orderLines, payments] = await Promise.all([
      orderLineIds.length
        ? odooRPC(
            '/web/dataset/call_kw',
            {
              model: 'pos.order.line',
              method: 'read',
              args: [orderLineIds],
              kwargs: {
                fields: ['id', 'order_id', 'full_product_name', 'qty', 'price_unit', 'price_subtotal_incl', 'discount', 'product_id'],
              },
            },
            sessionId
          )
        : [],
      orderIds.length
        ? odooRPC(
            '/web/dataset/call_kw',
            {
              model: 'pos.payment',
              method: 'search_read',
              args: [[['pos_order_id', 'in', orderIds]]],
              kwargs: {
                fields: ['id', 'amount', 'payment_method_id', 'pos_order_id'],
                limit: 10000,
              },
            },
            sessionId
          )
        : [],
    ]);

    const productIds = Array.isArray(orderLines)
      ? Array.from(
          new Set(
            orderLines
              .map((line: any) => (Array.isArray(line.product_id) ? line.product_id[0] : line.product_id))
              .filter(Boolean)
          )
        )
      : [];

    const paymentMethodIds = Array.isArray(payments)
      ? Array.from(
          new Set(
            payments
              .map((payment: any) => (Array.isArray(payment.payment_method_id) ? payment.payment_method_id[0] : payment.payment_method_id))
              .filter(Boolean)
          )
        )
      : [];

    const [products, paymentMethods] = await Promise.all([
      productIds.length
        ? odooRPC(
            '/web/dataset/call_kw',
            {
              model: 'product.product',
              method: 'read',
              args: [productIds],
              kwargs: {
                fields: ['id', 'pos_categ_ids'],
              },
            },
            sessionId
          )
        : [],
      paymentMethodIds.length
        ? odooRPC(
            '/web/dataset/call_kw',
            {
              model: 'pos.payment.method',
              method: 'read',
              args: [paymentMethodIds],
              kwargs: {
                fields: ['id', 'name', 'is_cash_count'],
              },
            },
            sessionId
          )
        : [],
    ]);

    const categoryIds = Array.isArray(products)
      ? Array.from(
          new Set(
            products.flatMap((product: any) => Array.isArray(product.pos_categ_ids) ? product.pos_categ_ids : [])
          )
        )
      : [];

    const categories = categoryIds.length
      ? await odooRPC(
          '/web/dataset/call_kw',
          {
            model: 'pos.category',
            method: 'read',
            args: [categoryIds],
            kwargs: { fields: ['id', 'name'] },
          },
          sessionId
        )
      : [];

    const productCategoryMap = new Map<number, string>();
    const categoryMap = new Map<number, string>(
      Array.isArray(categories) ? categories.map((category: any) => [category.id, category.name]) : []
    );

    if (Array.isArray(products)) {
      for (const product of products) {
        const firstCategoryId = Array.isArray(product.pos_categ_ids) ? product.pos_categ_ids[0] : undefined;
        productCategoryMap.set(product.id, firstCategoryId ? categoryMap.get(firstCategoryId) || 'Sans categorie' : 'Sans categorie');
      }
    }

    const paymentMethodMap = new Map<number, { name: string; isCash: boolean }>(
      Array.isArray(paymentMethods)
        ? paymentMethods.map((method: any) => [method.id, { name: method.name, isCash: Boolean(method.is_cash_count) }])
        : []
    );

    const groupedSales = new Map<string, {
      family: string;
      lines: Array<{
        id: number;
        name: string;
        quantity: number;
        unitPrice: number;
        total: number;
        discount: number;
        discountAmount: number;
      }>;
    }>();

    let itemCount = 0;
    let totalDiscount = 0;

    if (Array.isArray(orderLines)) {
      for (const line of orderLines) {
        const productId = Array.isArray(line.product_id) ? line.product_id[0] : line.product_id;
        const family = productId ? productCategoryMap.get(productId) || 'Sans categorie' : 'Sans categorie';
        const quantity = Number(line.qty || 0);
        const unitPrice = Number(line.price_unit || 0);
        const total = Number(line.price_subtotal_incl || 0);
        const discount = Number(line.discount || 0);
        const discountAmount = unitPrice * quantity * (discount / 100);

        itemCount += quantity;
        totalDiscount += discountAmount;

        if (!groupedSales.has(family)) {
          groupedSales.set(family, { family, lines: [] });
        }

        groupedSales.get(family)?.lines.push({
          id: line.id,
          name: line.full_product_name || 'Article',
          quantity,
          unitPrice,
          total,
          discount,
          discountAmount,
        });
      }
    }

    const paymentSummaryMap = new Map<string, number>();
    let cashTotal = 0;

    if (Array.isArray(payments)) {
      for (const payment of payments) {
        const paymentMethodId = Array.isArray(payment.payment_method_id) ? payment.payment_method_id[0] : payment.payment_method_id;
        const paymentMethod = paymentMethodId ? paymentMethodMap.get(paymentMethodId) : undefined;
        const label = paymentMethod?.name || 'Autre';
        const amount = Number(payment.amount || 0);

        paymentSummaryMap.set(label, (paymentSummaryMap.get(label) || 0) + amount);
        if (paymentMethod?.isCash) cashTotal += amount;
      }
    }

    const totalSales = Array.isArray(orders)
      ? orders.reduce((sum: number, order: any) => sum + Number(order.amount_total || 0), 0)
      : 0;

    const totalTax = Array.isArray(orders)
      ? orders.reduce((sum: number, order: any) => sum + Number(order.amount_tax || 0), 0)
      : 0;

    const firstSession = Array.isArray(sessions) && sessions.length > 0 ? sessions[0] : null;
    const lastSession = Array.isArray(sessions) && sessions.length > 0 ? sessions[sessions.length - 1] : null;
    const cashierName =
      firstSession && Array.isArray(firstSession.user_id)
        ? firstSession.user_id[1]
        : (Array.isArray(orders) && orders[0] && Array.isArray(orders[0].user_id) ? orders[0].user_id[1] : 'Caissier');

    return NextResponse.json({
      success: true,
      summary: {
        cashierName,
        date,
        sessionOpenAt: firstSession?.start_at || null,
        sessionCloseAt: lastSession?.stop_at || null,
        sessionState: lastSession?.state || null,
        totalSales,
        totalTax,
        totalDiscount,
        cashTotal,
        closureAmount: cashTotal,
        difference: 0,
        itemCount,
        ticketCount: Array.isArray(orders) ? orders.length : 0,
        payments: Array.from(paymentSummaryMap.entries()).map(([name, amount]) => ({ name, amount })),
        salesByFamily: Array.from(groupedSales.values()),
      },
    });
  } catch (error: any) {
    console.error('Closure GET error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch closure summary' }, { status: 500 });
  }
}
