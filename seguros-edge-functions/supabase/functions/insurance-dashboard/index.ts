import { ApiError, authorize, failed, json, preflight, segments, sqlError } from '../_shared/core.ts';

Deno.serve(async (req) => {
  const cors = preflight(req); if (cors) return cors;
  try {
    if (req.method !== 'GET' || segments(req,'insurance-dashboard').length) throw new ApiError(405,'Rota nao permitida');
    const { db } = await authorize(req);
    const { data, error } = await db.from('dashboard_summary').select('*').single();
    sqlError(error);
    return json({ data });
  } catch (err) { return failed(err); }
});
