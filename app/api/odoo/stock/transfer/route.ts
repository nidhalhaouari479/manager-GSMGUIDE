import { NextRequest, NextResponse } from 'next/server';
import { getUserCompanyIds } from '@/lib/odoo/companies';

const ODOO_URL = (process.env.NEXT_PUBLIC_ODOO_URL || 'http://localhost:8069').replace(/\/+$/, '');

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

const m2oId = (v: any): number | null => (Array.isArray(v) ? v[0] : Number.isInteger(v) ? v : null);

interface Warehouse {
  id: number;
  name: string;
  company_id: [number, string];
  lot_stock_id: [number, string];
  int_type_id: [number, string] | false;
  in_type_id: [number, string] | false;
  out_type_id: [number, string] | false;
}

/**
 * POST /api/odoo/stock/transfer — move stock of one product from one boutique (warehouse) to another.
 * Body: { productId, fromWarehouseId, toWarehouseId, qty }
 * Same company: one validated internal transfer.
 * Different companies: a delivery to the inter-company transit location, then a receipt from it.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('session_id');
    if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 401 });

    const body = await request.json();
    const productId = Number(body.productId);
    const fromWarehouseId = Number(body.fromWarehouseId);
    const toWarehouseId = Number(body.toWarehouseId);
    const qty = Number(body.qty);

    if (!Number.isInteger(productId) || !Number.isInteger(fromWarehouseId) || !Number.isInteger(toWarehouseId)) {
      return NextResponse.json({ error: 'Produit ou boutique invalide' }, { status: 400 });
    }
    if (fromWarehouseId === toWarehouseId) {
      return NextResponse.json({ error: 'La boutique de départ et d\'arrivée doivent être différentes' }, { status: 400 });
    }
    if (!(qty > 0)) {
      return NextResponse.json({ error: 'La quantité doit être supérieure à 0' }, { status: 400 });
    }

    const sessionInfo = await odooRPC('/web/session/get_session_info', {}, sessionId);
    if (!sessionInfo?.uid) return NextResponse.json({ error: 'Invalid Odoo session' }, { status: 401 });
    const allCompanyIds = await getUserCompanyIds(odooRPC, sessionId, sessionInfo);

    // The first allowed company is the active one, so records get created in the right company
    const contextFor = (companyId?: number, extra: Record<string, any> = {}) => ({
      ...(allCompanyIds.length > 0
        ? { allowed_company_ids: companyId ? [companyId, ...allCompanyIds.filter((c) => c !== companyId)] : allCompanyIds }
        : {}),
      ...extra,
    });
    const call = (model: string, method: string, args: any[], kwargs: Record<string, any> = {}, companyId?: number, extraCtx?: Record<string, any>) =>
      odooRPC(
        '/web/dataset/call_kw',
        { model, method, args, kwargs: { ...kwargs, context: contextFor(companyId, extraCtx) } },
        sessionId
      );

    const warehouses: Warehouse[] = await call('stock.warehouse', 'read', [[fromWarehouseId, toWarehouseId]], {
      fields: ['name', 'company_id', 'lot_stock_id', 'int_type_id', 'in_type_id', 'out_type_id'],
    });
    const from = warehouses.find((w) => w.id === fromWarehouseId);
    const to = warehouses.find((w) => w.id === toWarehouseId);
    if (!from || !to) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 });

    const [product] = await call('product.product', 'read', [[productId]], { fields: ['display_name', 'uom_id'] });
    if (!product) return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 });

    // Refuse to send more than the source boutique has on hand
    const quants: { quantity: number }[] = await call('stock.quant', 'search_read', [[
      ['product_id', '=', productId],
      ['location_id', 'child_of', from.lot_stock_id[0]],
    ]], { fields: ['quantity'] });
    const available = quants.reduce((sum, q) => sum + (q.quantity || 0), 0);
    if (qty > available) {
      return NextResponse.json(
        { error: `Stock insuffisant à ${from.name} : ${available} disponible(s), ${qty} demandé(s)` },
        { status: 400 }
      );
    }

    // Field names differ between Odoo 16 (move_lines / quantity_done) and 17+ (move_ids / quantity + picked)
    const [pickingFields, moveFields] = await Promise.all([
      call('stock.picking', 'fields_get', [], { attributes: ['type'] }),
      call('stock.move', 'fields_get', [], { attributes: ['type'] }),
    ]);
    const movesField = 'move_ids' in pickingFields ? 'move_ids' : 'move_lines';
    const hasPicked = 'picked' in moveFields;

    /** Create, confirm and validate one picking; returns its reference */
    const runPicking = async (companyId: number, pickingTypeId: number, srcLocId: number, dstLocId: number) => {
      const move: Record<string, any> = {
        product_id: productId,
        product_uom_qty: qty,
        product_uom: m2oId(product.uom_id),
        location_id: srcLocId,
        location_dest_id: dstLocId,
        company_id: companyId,
      };
      if ('name' in moveFields) move.name = product.display_name;

      const pickingId: number = await call('stock.picking', 'create', [{
        picking_type_id: pickingTypeId,
        location_id: srcLocId,
        location_dest_id: dstLocId,
        company_id: companyId,
        origin: `Transfert ${from.name} → ${to.name}`,
        [movesField]: [[0, 0, move]],
      }], {}, companyId);

      try {
        await call('stock.picking', 'action_confirm', [[pickingId]], {}, companyId);
        await call('stock.picking', 'action_assign', [[pickingId]], {}, companyId);

        const [picking] = await call('stock.picking', 'read', [[pickingId]], { fields: [movesField] }, companyId);
        const moveIds: number[] = picking[movesField];
        await call(
          'stock.move', 'write',
          [moveIds, hasPicked ? { quantity: qty, picked: true } : { quantity_done: qty }],
          {}, companyId
        );

        const result = await call('stock.picking', 'button_validate', [[pickingId]], {}, companyId, {
          skip_backorder: true,
          skip_immediate: true,
          skip_sms: true,
          skip_expired: true,
          picking_ids_not_to_backorder: [pickingId],
        });
        // A dict means Odoo opened a wizard instead of validating
        if (result && typeof result === 'object') {
          throw new Error(`Odoo n'a pas pu valider le transfert (${result.res_model || 'assistant requis'})`);
        }

        const [done] = await call('stock.picking', 'read', [[pickingId]], { fields: ['name', 'state'] }, companyId);
        if (done.state !== 'done') throw new Error(`Transfert ${done.name} non validé (état : ${done.state})`);
        return done.name as string;
      } catch (err) {
        // Don't leave a half-done picking behind
        await call('stock.picking', 'action_cancel', [[pickingId]], {}, companyId).catch(() => {});
        throw err;
      }
    };

    const fromCompanyId = from.company_id[0];
    const toCompanyId = to.company_id[0];
    const references: string[] = [];

    if (fromCompanyId === toCompanyId) {
      const typeId = m2oId(from.int_type_id);
      if (!typeId) throw new Error(`Aucun type "Transfert interne" pour ${from.name}`);
      references.push(await runPicking(fromCompanyId, typeId, from.lot_stock_id[0], to.lot_stock_id[0]));
    } else {
      const [transit] = await call('stock.location', 'search_read', [[
        ['usage', '=', 'transit'],
        ['company_id', '=', false],
      ]], { fields: ['id'], limit: 1 });
      if (!transit) throw new Error('Emplacement "Transit inter-sociétés" introuvable dans Odoo');

      const outTypeId = m2oId(from.out_type_id) || m2oId(from.int_type_id);
      const inTypeId = m2oId(to.in_type_id) || m2oId(to.int_type_id);
      if (!outTypeId || !inTypeId) throw new Error('Types d\'opération de stock manquants sur une des boutiques');

      references.push(await runPicking(fromCompanyId, outTypeId, from.lot_stock_id[0], transit.id));
      try {
        references.push(await runPicking(toCompanyId, inTypeId, transit.id, to.lot_stock_id[0]));
      } catch (err: any) {
        throw new Error(
          `Sortie ${references[0]} validée mais la réception à ${to.name} a échoué : ${err.message}. ` +
          `Les pièces sont dans "Transit inter-sociétés", à réceptionner dans Odoo.`
        );
      }
    }

    return NextResponse.json({
      success: true,
      transfer: {
        product: product.display_name,
        from: from.name,
        to: to.name,
        qty,
        references,
      },
    });
  } catch (error: any) {
    console.error('Stock transfer error:', error);
    return NextResponse.json({ error: error.message || 'Failed to transfer stock' }, { status: 500 });
  }
}
