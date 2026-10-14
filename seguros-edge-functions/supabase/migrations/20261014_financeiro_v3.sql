-- Financeiro V3. PREREQUISITO: migracao 20261014_financeiro_v2.sql aplicada.
-- Execute uma unica vez no SQL Editor; transacional e aditivo.
BEGIN;

-- Bloqueia mudanca do premio que faria o cronograma ja gerado divergir.
CREATE OR REPLACE FUNCTION public.guard_policy_financial_amounts()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.premium_amount IS DISTINCT FROM NEW.premium_amount AND EXISTS (
    SELECT 1 FROM public.policy_payment_terms WHERE policy_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Esta apolice tem plano financeiro: altere o premio somente apos conciliacao manual das parcelas';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS guard_policy_financial_amounts ON public.policies;
CREATE TRIGGER guard_policy_financial_amounts
  BEFORE UPDATE OF premium_amount ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.guard_policy_financial_amounts();

-- As escritas no financeiro da corretora acontecem apenas pelas funcoes RPC
-- (SECURITY DEFINER com verificacao explicita do usuario ativo).
ALTER FUNCTION public.configure_policy_financials(uuid,numeric,text,integer,boolean,numeric,date,numeric,integer,date) SECURITY DEFINER;
ALTER FUNCTION public.set_brokerage_receipt(uuid,boolean,date) SECURITY DEFINER;
REVOKE INSERT, UPDATE, DELETE ON public.policy_payment_terms FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.brokerage_agreements FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.brokerage_receivables FROM authenticated;
-- A tabela policy_installments permanece gravavel para compatibilidade com insurance-api.
-- Antes da producao, centralizar TODAS essas escritas num RPC proprio.

-- Ajuste importante: agenciamento recebido entra no mes do RECEBIMENTO,
-- nao no mes originalmente previsto. Previsto considera o cronograma integral.
CREATE OR REPLACE VIEW public.brokerage_monthly_summary
WITH (security_invoker = true) AS
WITH previsao AS (
 SELECT date_trunc('month', due_date)::date AS mes,
        SUM(amount)::numeric(15,2) AS esperado,
        COUNT(*)::bigint AS qtd_prevista,
        COUNT(*) FILTER (WHERE status='pendente')::bigint AS qtd_pendente
 FROM public.brokerage_receivables
 WHERE status <> 'cancelada'
 GROUP BY 1
), recebido AS (
 SELECT date_trunc('month', received_at)::date AS mes,
        SUM(received_amount)::numeric(15,2) AS realizado,
        COUNT(*)::bigint AS qtd_recebida
 FROM public.brokerage_receivables
 WHERE status = 'recebida' AND received_at IS NOT NULL
 GROUP BY 1
)
SELECT COALESCE(p.mes,r.mes) AS month,
       COALESCE(p.esperado,0)::numeric(15,2) AS expected_amount,
       COALESCE(r.realizado,0)::numeric(15,2) AS received_amount,
       COALESCE(p.qtd_pendente,0) AS pending_installments,
       COALESCE(r.qtd_recebida,0) AS received_installments
FROM previsao p FULL OUTER JOIN recebido r ON p.mes=r.mes;
GRANT SELECT ON public.brokerage_monthly_summary TO authenticated;

-- Painel detalhado da corretora: identifica a apolice para cada parcela.
CREATE OR REPLACE VIEW public.brokerage_receivables_overview
WITH (security_invoker = true) AS
SELECT br.id, br.policy_id, p.policy_number, p.insurer_name,
       br.installment_number, br.amount, br.due_date, br.status,
       br.received_at, br.received_amount,
       (br.status='pendente' AND br.due_date < CURRENT_DATE) AS is_overdue
FROM public.brokerage_receivables br
JOIN public.policies p ON p.id=br.policy_id;
GRANT SELECT ON public.brokerage_receivables_overview TO authenticated;

COMMIT;
