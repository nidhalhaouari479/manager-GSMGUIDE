type OdooRPC = (endpoint: string, params: any, sessionId: string) => Promise<any>;

/** allowed_companies is an array of [id, name] (old Odoo) or an object keyed by id (Odoo 16+) */
function extractCompanyIds(allowed: any): number[] {
  if (Array.isArray(allowed)) {
    return allowed.map((c: any) => (Array.isArray(c) ? c[0] : c?.id)).filter((id: any) => Number.isInteger(id));
  }
  if (allowed && typeof allowed === 'object') {
    return Object.keys(allowed).map((k) => parseInt(k, 10)).filter((id) => Number.isInteger(id));
  }
  return [];
}

/**
 * Every company the logged-in user may access, so all boutiques are visible.
 * Reads res.users.company_ids (reliable on every Odoo version); falls back to the session info,
 * whose user_companies shape varies and is missing when the user lacks the multi-company group.
 */
export async function getUserCompanyIds(odooRPC: OdooRPC, sessionId: string, sessionInfo: any): Promise<number[]> {
  const uid = sessionInfo?.uid;
  if (uid) {
    try {
      const [user] = await odooRPC(
        '/web/dataset/call_kw',
        { model: 'res.users', method: 'read', args: [[uid], ['company_ids']], kwargs: {} },
        sessionId
      );
      if (Array.isArray(user?.company_ids) && user.company_ids.length > 0) return user.company_ids;
    } catch {
      // fall through to session info
    }
  }
  return extractCompanyIds(sessionInfo?.user_companies?.allowed_companies);
}
