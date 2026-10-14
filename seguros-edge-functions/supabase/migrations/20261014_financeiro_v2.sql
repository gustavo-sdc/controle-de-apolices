-- Migracao incremental: preserva apolices, parcelas e outros registros existentes.
BEGIN;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS net_premium_amount numeric(15,2)
 CHECK (net_premium_amount IS NULL OR net_premium_amount >= 0);

CREATE TABLE IF NOT EXISTS public.policy_payment_terms (
 policy_id uuid PRIMARY KEY REFERENCES public.policies(id) ON DELETE RESTRICT,
 payment_method text NOT NULL CHECK (payment_method IN (
   'cartao_parcelado','debito_automatico_parcelado','boleto_parcelado',
   'cartao_a_vista','debito','pix')),
 installments integer NOT NULL CHECK (installments BETWEEN 1 AND 360),
 interest_applies boolean NOT NULL DEFAULT false,
 interest_amount numeric(15,2) NOT NULL DEFAULT 0 CHECK (interest_amount >= 0),
 first_due_date date NOT NULL,
 notes text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT single_payment_only CHECK (
   payment_method IN ('cartao_parcelado','debito_automatico_parcelado','boleto_parcelado')
   OR installments = 1),
 CONSTRAINT consistent_interest CHECK (interest_applies OR interest_amount = 0)
);
-- interest_amount e o valor TOTAL dos juros, nao uma taxa percentual.
CREATE TABLE IF NOT EXISTS public.brokerage_agreements (
 policy_id uuid PRIMARY KEY REFERENCES public.policies(id) ON DELETE RESTRICT,
 agency_percentage numeric(12,4) NOT NULL CHECK (agency_percentage >= 0 AND agency_percentage <= 1000000),
 installments integer NOT NULL CHECK (installments BETWEEN 1 AND 360),
 first_receipt_date date NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.brokerage_receivables (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 policy_id uuid NOT NULL REFERENCES public.policies(id) ON DELETE RESTRICT,
 installment_number integer NOT NULL CHECK (installment_number > 0),
 amount numeric(15,2) NOT NULL CHECK (amount >= 0),
 due_date date NOT NULL,
 status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','recebida','cancelada')),
 received_at date,
 received_amount numeric(15,2),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(policy_id, installment_number),
 CONSTRAINT receipt_consistency CHECK ((status='recebida' AND received_at IS NOT NULL AND received_amount IS NOT NULL AND received_amount >= 0)
 OR (status <> 'recebida' AND received_at IS NULL AND received_amount IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_brokerage_receivables_due ON public.brokerage_receivables(due_date,status);
CREATE INDEX IF NOT EXISTS idx_brokerage_receivables_policy ON public.brokerage_receivables(policy_id);

-- Datas mensais sempre calculadas desde a data original (evita acumulo de deslocamento).
CREATE OR REPLACE FUNCTION public.finance_month(base_date date, installment_index integer)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT (base_date + make_interval(months => installment_index))::date
$$;

-- Uma chamada e uma transacao. Exige usuario autenticado/ativo e respeita RLS.
CREATE OR REPLACE FUNCTION public.configure_policy_financials(
 p_policy_id uuid,
 p_net_premium numeric,
 p_payment_method text,
 p_client_installments integer,
 p_interest_applies boolean,
 p_interest_amount numeric,
 p_first_due_date date,
 p_agency_percentage numeric,
 p_agency_installments integer,
 p_agency_first_date date
)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
 p public.policies%ROWTYPE;
 existing_client integer;
 existing_broker integer;
 received_broker integer;
 expected_client numeric(15,2);
 expected_broker numeric(15,2);
 base_cents bigint;
 total_cents bigint;
 i integer;
 each_cents bigint;
BEGIN
 IF NOT (SELECT public.is_active_staff()) THEN RAISE EXCEPTION 'Acesso nao autorizado'; END IF;
 SELECT * INTO p FROM public.policies WHERE id=p_policy_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Apolice nao encontrada'; END IF;
 IF p_net_premium IS NULL OR p_net_premium < 0 OR p_agency_percentage IS NULL OR p_agency_percentage < 0 OR p_agency_percentage > 1000000
  THEN RAISE EXCEPTION 'Premio liquido ou percentual de agenciamento invalido'; END IF;
 IF p_client_installments IS NULL OR p_client_installments NOT BETWEEN 1 AND 360
 OR p_agency_installments IS NULL OR p_agency_installments NOT BETWEEN 1 AND 360
 OR p_first_due_date IS NULL OR p_agency_first_date IS NULL
 THEN RAISE EXCEPTION 'Datas e quantidade de parcelas sao obrigatorias'; END IF;
 IF p_payment_method NOT IN ('cartao_parcelado','debito_automatico_parcelado','boleto_parcelado','cartao_a_vista','debito','pix')
 OR (p_payment_method IN ('cartao_a_vista','debito','pix') AND p_client_installments <> 1)
 THEN RAISE EXCEPTION 'Forma de pagamento ou parcelamento invalido'; END IF;
 IF p_interest_applies IS NULL OR p_interest_amount IS NULL OR p_interest_amount < 0 OR (NOT p_interest_applies AND p_interest_amount <> 0)
 THEN RAISE EXCEPTION 'Valor de juros invalido'; END IF;
 IF p.premium_amount IS NULL THEN RAISE EXCEPTION 'Informe primeiro o premio total da apolice'; END IF;
 expected_client := round(p.premium_amount + p_interest_amount,2);
 expected_broker := round(p_net_premium * p_agency_percentage / 100,2);
 IF expected_broker > 9999999999999.99 THEN RAISE EXCEPTION 'Valor de agenciamento excede o limite'; END IF;
 SELECT count(*) INTO existing_client FROM public.policy_installments WHERE policy_id=p_policy_id;
 SELECT count(*) INTO existing_broker FROM public.brokerage_receivables WHERE policy_id=p_policy_id;
 SELECT count(*) INTO received_broker FROM public.brokerage_receivables WHERE policy_id=p_policy_id AND status='recebida';
 -- Evita mudar um plano de cliente cuja programacao ja existe, sem reconciliacao manual.
 IF existing_client > 0 AND (SELECT count(*) FROM public.policy_installments WHERE policy_id=p_policy_id AND status='pendente') <> existing_client THEN
   RAISE EXCEPTION 'Ja existem parcelas pagas ou canceladas. Ajuste manual antes de reconfigurar';
 END IF;
 IF received_broker > 0 THEN RAISE EXCEPTION 'Ja existem agenciamentos recebidos. Reconciliacao manual necessaria'; END IF;
 -- Nao apaga nem substitui parcelas antigas do segurado, mesmo quando pendentes.
 IF existing_client > 0 THEN
   IF NOT EXISTS (SELECT 1 FROM public.policy_payment_terms WHERE policy_id=p_policy_id) THEN
     RAISE EXCEPTION 'Apolice possui parcelas antigas. Reconcile-as antes de criar o plano';
   END IF;
   IF (SELECT (payment_method,installments,interest_applies,interest_amount,first_due_date)
       FROM public.policy_payment_terms WHERE policy_id=p_policy_id)
      IS DISTINCT FROM ROW(p_payment_method,p_client_installments,p_interest_applies,p_interest_amount,p_first_due_date) THEN
     RAISE EXCEPTION 'Apolice com parcelas existentes: nao e permitido alterar o plano automaticamente';
   END IF;
 END IF;
 UPDATE public.policies SET net_premium_amount=p_net_premium WHERE id=p_policy_id;
 INSERT INTO public.policy_payment_terms AS t (policy_id,payment_method,installments,interest_applies,interest_amount,first_due_date)
 VALUES(p_policy_id,p_payment_method,p_client_installments,p_interest_applies,p_interest_amount,p_first_due_date)
 ON CONFLICT(policy_id) DO UPDATE SET payment_method=EXCLUDED.payment_method,installments=EXCLUDED.installments,
 interest_applies=EXCLUDED.interest_applies,interest_amount=EXCLUDED.interest_amount,
 first_due_date=EXCLUDED.first_due_date,updated_at=now();
 IF existing_client = 0 THEN
   total_cents := (expected_client * 100)::bigint;
   base_cents := total_cents / p_client_installments;
   FOR i IN 1..p_client_installments LOOP
     each_cents := base_cents + CASE WHEN i=p_client_installments THEN total_cents-base_cents*p_client_installments ELSE 0 END;
     INSERT INTO public.policy_installments(policy_id,installment_number,amount,due_date,created_by)
     VALUES(p_policy_id,i,each_cents::numeric / 100,public.finance_month(p_first_due_date,i-1),auth.uid());
   END LOOP;
 END IF;
 INSERT INTO public.brokerage_agreements AS a (policy_id,agency_percentage,installments,first_receipt_date)
 VALUES (p_policy_id,p_agency_percentage,p_agency_installments,p_agency_first_date)
 ON CONFLICT(policy_id) DO UPDATE SET agency_percentage=EXCLUDED.agency_percentage,
 installments=EXCLUDED.installments,first_receipt_date=EXCLUDED.first_receipt_date,updated_at=now();
 IF existing_broker > 0 THEN DELETE FROM public.brokerage_receivables WHERE policy_id=p_policy_id; END IF;
 total_cents := (expected_broker * 100)::bigint;
 base_cents := total_cents / p_agency_installments;
 FOR i IN 1..p_agency_installments LOOP
   each_cents := base_cents + CASE WHEN i=p_agency_installments THEN total_cents-base_cents*p_agency_installments ELSE 0 END;
   INSERT INTO public.brokerage_receivables(policy_id,installment_number,amount,due_date)
   VALUES(p_policy_id,i,each_cents::numeric / 100,public.finance_month(p_agency_first_date,i-1));
 END LOOP;
END; $$;

ALTER TABLE public.policy_payment_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brokerage_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brokerage_receivables ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['policy_payment_terms','brokerage_agreements','brokerage_receivables'] LOOP
 EXECUTE format('CREATE POLICY staff_read ON public.%I FOR SELECT TO authenticated USING ((SELECT public.is_active_staff()))',t);
 EXECUTE format('CREATE POLICY staff_insert ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_active_staff()))',t);
 EXECUTE format('CREATE POLICY staff_update ON public.%I FOR UPDATE TO authenticated USING ((SELECT public.is_active_staff())) WITH CHECK ((SELECT public.is_active_staff()))',t);
 EXECUTE format('CREATE POLICY manager_delete ON public.%I FOR DELETE TO authenticated USING ((SELECT public.is_manager()))',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.configure_policy_financials(uuid,numeric,text,integer,boolean,numeric,date,numeric,integer,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.configure_policy_financials(uuid,numeric,text,integer,boolean,numeric,date,numeric,integer,date) TO authenticated;

-- Consolidado mensal de agenciamento (valores previstos e recebidos separados).
CREATE OR REPLACE VIEW public.brokerage_monthly_summary WITH (security_invoker=true) AS
 SELECT date_trunc('month',due_date)::date AS month,
 coalesce(sum(amount) FILTER (WHERE status='pendente'),0)::numeric(15,2) AS expected_amount,
 coalesce(sum(received_amount) FILTER (WHERE status='recebida'),0)::numeric(15,2) AS received_amount,
 count(*) FILTER (WHERE status='pendente') AS pending_installments,
 count(*) FILTER (WHERE status='recebida') AS received_installments
 FROM public.brokerage_receivables GROUP BY 1;
GRANT SELECT ON public.brokerage_monthly_summary TO authenticated;

-- Baixa/estorno de agenciamento com controle atomico no banco.
CREATE OR REPLACE FUNCTION public.set_brokerage_receipt(p_receivable_id uuid,p_received boolean,p_date date DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE item public.brokerage_receivables%ROWTYPE;
BEGIN
 IF NOT (SELECT public.is_active_staff()) THEN RAISE EXCEPTION 'Acesso nao autorizado'; END IF;
 SELECT * INTO item FROM public.brokerage_receivables WHERE id=p_receivable_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recebimento nao encontrado'; END IF;
 IF item.status='cancelada' THEN RAISE EXCEPTION 'Parcela cancelada'; END IF;
 IF p_received THEN
   IF item.status <> 'pendente' THEN RAISE EXCEPTION 'Parcela ja recebida'; END IF;
   UPDATE public.brokerage_receivables SET status='recebida',received_at=COALESCE(p_date,current_date),
    received_amount=item.amount,updated_at=now() WHERE id=p_receivable_id;
 ELSE
   IF item.status <> 'recebida' THEN RAISE EXCEPTION 'Parcela nao recebida'; END IF;
   UPDATE public.brokerage_receivables SET status='pendente',received_at=NULL,received_amount=NULL,
    updated_at=now() WHERE id=p_receivable_id;
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public.set_brokerage_receipt(uuid,boolean,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_brokerage_receipt(uuid,boolean,date) TO authenticated;

COMMIT;
