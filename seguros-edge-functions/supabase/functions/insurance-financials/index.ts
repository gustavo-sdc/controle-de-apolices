import { ApiError, authorize, body, failed, json, preflight, segments, sqlError, uuid } from '../_shared/core.ts';

Deno.serve(async (req) => {
  const cors = preflight(req); if (cors) return cors;
  try {
    const { db } = await authorize(req);
    const [section, id, action] = segments(req, 'insurance-financials');
    if (section === 'policy' && id && action === 'brokerage' && req.method === 'PATCH') {
      uuid(id);
      const x = await body(req) as Record<string, unknown>;
      const keys = ['net_premium','agency_percentage','agency_installments','agency_first_date'];
      if (keys.some(k => !(k in x))) throw new ApiError(422, 'Preencha todos os campos do agenciamento');
      if (typeof x.net_premium !== 'number' || !Number.isFinite(x.net_premium) || x.net_premium < 0 ||
          typeof x.agency_percentage !== 'number' || !Number.isFinite(x.agency_percentage) || x.agency_percentage < 0 ||
          typeof x.agency_installments !== 'number' || !Number.isInteger(x.agency_installments) ||
          x.agency_installments < 1 || x.agency_installments > 360 ||
          typeof x.agency_first_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.agency_first_date))
        throw new ApiError(422, 'Campos do agenciamento inválidos');
      const {error} = await db.rpc('configure_brokerage_only', {
        p_policy_id: id, p_net_premium: x.net_premium,
        p_agency_percentage: x.agency_percentage,
        p_agency_installments: x.agency_installments,
        p_agency_first_date: x.agency_first_date,
      });
      if (error) throw new ApiError(error.code === '42501' ? 403 : 422, error.message);
      return json({success: true});
    }
    if (section === 'policy' && id && !action) {
      uuid(id);
      if (req.method === 'GET') {
        const [policy, payment, agreement, clientSchedule, agencySchedule] = await Promise.all([
          db.from('policies').select('id,policy_number,premium_amount,net_premium_amount,coverage_amount,deductible_amount').eq('id', id).maybeSingle(),
          db.from('policy_payment_terms').select('*').eq('policy_id', id).maybeSingle(),
          db.from('brokerage_agreements').select('*').eq('policy_id', id).maybeSingle(),
          db.from('policy_installments').select('id,installment_number,amount,due_date,status,paid_at,paid_amount').eq('policy_id', id).order('installment_number'),
          db.from('brokerage_receivables').select('*').eq('policy_id', id).order('installment_number'),
        ]);
        for (const r of [policy, payment, agreement, clientSchedule, agencySchedule]) sqlError(r.error);
        if (!policy.data) throw new ApiError(404, 'Apólice não encontrada');
        return json({ policy: policy.data, payment: payment.data, agreement: agreement.data,
          client_schedule: clientSchedule.data, agency_schedule: agencySchedule.data });
      }
      if (req.method === 'PATCH') {
        const x = await body(req) as Record<string, unknown>;
        const required = ['net_premium','payment_method','client_installments','interest_applies','interest_amount','first_due_date','agency_percentage','agency_installments','agency_first_date'];
        if (required.some(k => !(k in x))) throw new ApiError(422, 'Preencha todos os campos financeiros');
        const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : NaN;
        if (!Number.isFinite(num(x.net_premium)) || num(x.net_premium)<0 || !Number.isFinite(num(x.agency_percentage)) || num(x.agency_percentage)<0 ||
          !(typeof x.client_installments === 'number' && Number.isInteger(x.client_installments)) || !(typeof x.agency_installments === 'number' && Number.isInteger(x.agency_installments)) ||
          typeof x.interest_applies !== 'boolean' || !Number.isFinite(num(x.interest_amount)) || num(x.interest_amount)<0 ||
          typeof x.payment_method !== 'string' || typeof x.first_due_date !== 'string' || typeof x.agency_first_date !== 'string')
          throw new ApiError(422,'Campos financeiros inválidos');
        const { error } = await db.rpc('configure_policy_financials', {
          p_policy_id:id, p_net_premium:x.net_premium, p_payment_method:x.payment_method,
          p_client_installments:x.client_installments, p_interest_applies:x.interest_applies,
          p_interest_amount:x.interest_amount, p_first_due_date:x.first_due_date,
          p_agency_percentage:x.agency_percentage, p_agency_installments:x.agency_installments,
          p_agency_first_date:x.agency_first_date,
        });
        if (error) throw new ApiError(error.code === '42501' ? 403 : 422, error.message);
        return json({ success: true });
      }
    }
    if (section === 'receivable' && id && action === 'receipt' && req.method === 'POST') {
      uuid(id);
      const x = await body(req) as Record<string, unknown>;
      if (typeof x.received !== 'boolean') throw new ApiError(422, 'Informe received como boolean');
      if (x.date !== undefined && (typeof x.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)))
        throw new ApiError(422, 'Data inválida');
      const { error } = await db.rpc('set_brokerage_receipt', { p_receivable_id:id, p_received:x.received, p_date:x.date ?? null });
      sqlError(error); return json({ success: true });
    }
    if (section === 'monthly' && !id && req.method === 'GET') {
      const { data, error } = await db.from('brokerage_monthly_summary').select('*').order('month');
      sqlError(error); return json({ data });
    }
    throw new ApiError(404,'Rota não encontrada');
  } catch (e) { return failed(e); }
});
