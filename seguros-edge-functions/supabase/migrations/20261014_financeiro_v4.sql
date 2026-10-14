-- Dependencias: Financeiro V2 e V3 instalados.
-- Agenciamento independente das parcelas do segurado (inclusive antigas e pagas).
BEGIN;
CREATE OR REPLACE FUNCTION public.configure_brokerage_only(
  p_policy_id uuid, p_net_premium numeric, p_agency_percentage numeric,
  p_agency_installments integer, p_agency_first_date date
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.policies%ROWTYPE;
  total_cents bigint;
  each_cents bigint;
  base_cents bigint;
  i integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_staff() THEN
    RAISE EXCEPTION 'Usuário não autorizado' USING ERRCODE='42501';
  END IF;
  SELECT * INTO p FROM public.policies WHERE id=p_policy_id FOR UPDATE;
  IF NOT FOUND OR NOT p.is_active THEN
    RAISE EXCEPTION 'Apólice não encontrada ou inativa' USING ERRCODE='P0001';
  END IF;
  IF p_net_premium IS NULL OR p_net_premium < 0 OR p_net_premium > 9999999999999.99
     OR p_agency_percentage IS NULL OR p_agency_percentage < 0 OR p_agency_percentage > 1000000
     OR p_agency_installments IS NULL OR p_agency_installments NOT BETWEEN 1 AND 360
     OR p_agency_first_date IS NULL THEN
    RAISE EXCEPTION 'Verifique o prêmio líquido, percentual, parcelas e primeira data do agenciamento' USING ERRCODE='P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.brokerage_receivables
             WHERE policy_id=p_policy_id AND status <> 'pendente') THEN
    RAISE EXCEPTION 'Já existem recebimentos ou cancelamentos: concilie antes de reprogramar o agenciamento' USING ERRCODE='P0001';
  END IF;
  total_cents := round(p_net_premium * p_agency_percentage)::bigint;
  IF total_cents > 999999999999999 THEN
    RAISE EXCEPTION 'Agenciamento excede o valor máximo permitido' USING ERRCODE='P0001';
  END IF;
  UPDATE public.policies SET net_premium_amount=p_net_premium WHERE id=p_policy_id;
  INSERT INTO public.brokerage_agreements AS a (policy_id,agency_percentage,installments,first_receipt_date)
  VALUES(p_policy_id,p_agency_percentage,p_agency_installments,p_agency_first_date)
  ON CONFLICT (policy_id) DO UPDATE SET agency_percentage=EXCLUDED.agency_percentage,
    installments=EXCLUDED.installments,first_receipt_date=EXCLUDED.first_receipt_date,updated_at=now();
  DELETE FROM public.brokerage_receivables WHERE policy_id=p_policy_id;
  base_cents := total_cents / p_agency_installments;
  FOR i IN 1..p_agency_installments LOOP
    each_cents := base_cents + CASE WHEN i=p_agency_installments
      THEN total_cents-base_cents*p_agency_installments ELSE 0 END;
    INSERT INTO public.brokerage_receivables(policy_id,installment_number,amount,due_date)
    VALUES(p_policy_id,i,each_cents::numeric/100,public.finance_month(p_agency_first_date,i-1));
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.configure_brokerage_only(uuid,numeric,numeric,integer,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.configure_brokerage_only(uuid,numeric,numeric,integer,date) TO authenticated;
COMMIT;
