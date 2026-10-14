import { ApiError, authorize, body, failed, json, limitFrom, preflight, requireKeys, segments, sqlError, uuid } from '../_shared/core.ts';

// Recursos permitidos; nunca aceitar nome de tabela/coluna fornecido pelo usuario sem whitelist.
const fields = {
  people: ['full_name','cpf','birth_date','email','phone','mobile_phone','occupation','notes','is_active'],
  clients: ['kind','person_id','company_name','trade_name','cnpj','state_registration','contact_name','email','phone','zip_code','address_line','address_number','address_complement','neighborhood','city','state_code','notes','is_active'],
  insured_persons: ['person_id','notes','is_active'],
  policies: ['client_id','policy_number','proposal_number','insurer_name','broker_name','product_name','insurance_type','description','effective_from','effective_until','issue_date','coverage_amount','premium_amount','deductible_amount','currency','status','cancellation_reason','notes','is_active'],
  policy_insured_persons: ['policy_id','insured_person_id','relation','responsible_insured_id','notes','is_active'],
  policy_installments: ['policy_id','installment_number','amount','due_date','paid_at','paid_amount','status','payment_method','reference','notes','is_active'],
  documents: ['client_id','policy_id','insured_person_id','kind','file_name','storage_path','mime_type','size_bytes','description','is_active'],
} as const;
const required: Record<string, string[]> = {
  people: ['full_name'], clients: ['kind'], insured_persons: ['person_id'],
  policies: ['client_id','policy_number','insurer_name','insurance_type','effective_from','effective_until'],
  policy_insured_persons: ['policy_id','insured_person_id'],
  policy_installments: ['policy_id','installment_number','amount','due_date'],
  documents: ['file_name','storage_path'],
};

Deno.serve(async (req) => {
  const cors = preflight(req); if (cors) return cors;
  try {
    const { db, profile, userId } = await authorize(req);
    const [resource, id, action] = segments(req, 'insurance-api');
    if (!resource || !(resource in fields)) throw new ApiError(404, 'Recurso nao encontrado');
    const table = resource as keyof typeof fields;
    if (id && !(table === 'documents' && id === 'upload-url')) uuid(id);
    const url = new URL(req.url);

    if (req.method === 'GET') {
      if (action) throw new ApiError(404, 'Rota nao encontrada');
      if (id) {
        const { data, error } = await db.from(table).select('*').eq('id', id).maybeSingle();
        sqlError(error); if (!data) throw new ApiError(404, 'Registro nao encontrado');
        return json({ data });
      }
      const { limit, offset } = limitFrom(url);
      let q = db.from(table).select('*', { count: 'exact' });
      if (url.searchParams.has('active')) {
        const value = url.searchParams.get('active');
        if (!['true','false'].includes(value || '')) throw new ApiError(400, 'Filtro active invalido');
        q = q.eq('is_active', value === 'true');
      }
      // Somente filtros de chave estrangeira ja conhecidos e validados.
      for (const key of ['client_id','policy_id','person_id','insured_person_id'] as const) {
        const allowed = (fields[table] as readonly string[]).includes(key);
        if (allowed && url.searchParams.has(key)) { const value = url.searchParams.get(key)!; uuid(value); q = q.eq(key, value); }
      }
      const { data, count, error } = await q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      sqlError(error); return json({ data, pagination: { limit, offset, total: count } });
    }

    if (req.method === 'POST' && table === 'documents' && id === 'upload-url' && !action) {
      const input = requireKeys(await body(req), ['file_name','mime_type'], ['file_name','mime_type']);
      const allowed = ['application/pdf','image/jpeg','image/png','image/webp'];
      if (typeof input.mime_type !== 'string' || !allowed.includes(input.mime_type)) throw new ApiError(422, 'Tipo de arquivo nao permitido');
      if (typeof input.file_name !== 'string' || !/^[a-zA-Z0-9._-]{1,160}$/.test(input.file_name)) throw new ApiError(422, 'Nome de arquivo invalido (use apenas letras, numeros, ponto, hifen e underline)');
      const storage_path = `documents/${crypto.randomUUID()}/${input.file_name}`;
      const { data, error } = await db.storage.from('insurance-documents').createSignedUploadUrl(storage_path);
      sqlError(error);
      return json({ path: storage_path, token: data!.token, signedUrl: data!.signedUrl }, 201);
    }
    if (req.method === 'POST' && !id) {
      const input = requireKeys(await body(req), fields[table], required[table]);
      if (table === 'clients' && input.kind === 'pf' && !input.person_id) throw new ApiError(422, 'Cliente PF exige person_id');
      if (table === 'clients' && input.kind === 'pj' && (!input.company_name || !input.cnpj)) throw new ApiError(422, 'Cliente PJ exige company_name e cnpj');
      if (table === 'documents') {
        if (typeof input.storage_path !== 'string' || !/^documents\/[0-9a-f-]{36}\/[a-zA-Z0-9._-]{1,160}$/.test(input.storage_path)) throw new ApiError(422, 'storage_path invalido');
        const owns = ['client_id','policy_id','insured_person_id'].filter((k) => input[k]);
        if (owns.length !== 1) throw new ApiError(422, 'Documento precisa ter exatamente um vinculo');
        // Confirma que arquivo realmente existe no bucket privado.
        const folder = input.storage_path.split('/').slice(0, 2).join('/');
        const filename = input.storage_path.split('/').at(-1)!;
        const { data: files, error: storageError } = await db.storage.from('insurance-documents').list(folder, { search: filename, limit: 100 });
        sqlError(storageError);
        if (!files?.some((file) => file.name === filename)) throw new ApiError(422, 'Arquivo nao encontrado no Storage');
      }
      if (table === 'policy_installments') {
        // Cadastro de parcelas sempre comeca pendente, sem dados de baixa.
        if (input.status !== undefined && input.status !== 'pendente') throw new ApiError(422, 'Nova parcela deve ser pendente');
        if (input.paid_at != null || input.paid_amount != null || input.payment_method != null || input.reference != null)
          throw new ApiError(422, 'Nao informe dados de pagamento no cadastro');
        if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0)
          throw new ApiError(422, 'Valor da parcela deve ser maior que zero');
        if (!Number.isSafeInteger(input.installment_number) || Number(input.installment_number) <= 0)
          throw new ApiError(422, 'Numero de parcela invalido');
      }
      if (table === 'policies' && input.status && input.status !== 'rascunho') throw new ApiError(422, 'Crie a apolice como rascunho, associe o titular e depois ative');
      const { data, error } = await db.from(table).insert({ ...input, created_by: userId }).select().single();
      sqlError(error); return json({ data }, 201);
    }

    if (req.method === 'POST' && table === 'documents' && id && action === 'download-url') {
      const { data: record, error } = await db.from('documents').select('storage_path,is_active').eq('id',id).single();
      sqlError(error); if (!record?.is_active) throw new ApiError(404, 'Documento nao encontrado');
      const { data, error: signError } = await db.storage.from('insurance-documents').createSignedUrl(record.storage_path, 60);
      sqlError(signError); return json({ url: data!.signedUrl, expires_in: 60 });
    }
    if (req.method === 'PATCH' && id && !action) {
      const input = requireKeys(await body(req), fields[table]);
      if (table === 'policy_installments') {
        // Bloqueia alteracoes de status ou de valores que contornem o fluxo de baixa.
        const { data: current, error: currentError } = await db.from('policy_installments')
          .select('status,amount,paid_amount,is_active').eq('id', id).maybeSingle();
        sqlError(currentError);
        if (!current) throw new ApiError(404, 'Parcela nao encontrada');
        if (!current.is_active) throw new ApiError(422, 'Parcela inativa');
        const nextStatus = input.status ?? current.status;
        if (input.policy_id !== undefined || input.installment_number !== undefined || input.amount !== undefined || input.due_date !== undefined)
          throw new ApiError(422, 'Campos financeiros da parcela nao podem ser alterados por esta rota');
        if (!['pendente', 'paga', 'cancelada'].includes(String(nextStatus))) throw new ApiError(422, 'Status invalido');
        if (current.status === 'cancelada' || (current.status === 'paga' && nextStatus === 'cancelada'))
          throw new ApiError(422, 'Transicao de status nao permitida');
        if (current.status === 'pendente' && nextStatus === 'paga') {
          if (typeof input.paid_at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.paid_at))
            throw new ApiError(422, 'Informe uma data de pagamento valida');
          if (typeof input.paid_amount !== 'number' || !Number.isFinite(input.paid_amount) || input.paid_amount <= 0 || input.paid_amount > Number(current.amount))
            throw new ApiError(422, 'Valor recebido invalido');
        } else if (current.status === 'paga' && nextStatus === 'pendente') {
          if (input.paid_at !== null || input.paid_amount !== null)
            throw new ApiError(422, 'O estorno deve limpar data e valor recebidos');
        } else {
          if (['paid_at','paid_amount','payment_method','reference'].some(k => k in input))
            throw new ApiError(422, 'Dados de pagamento so podem ser alterados durante a baixa ou estorno');
        }
        if (input.is_active !== undefined) throw new ApiError(422, 'Desativacao de parcela nao disponivel nesta API');
      }
      if (table === 'documents' && ('storage_path' in input || 'client_id' in input || 'policy_id' in input || 'insured_person_id' in input)) {
        throw new ApiError(422, 'Nao e permitido alterar arquivo ou propriedade de documento');
      }
      if (table === 'policies' && 'client_id' in input) throw new ApiError(422, 'Nao e permitido trocar o cliente pela API');
      if (table === 'policy_insured_persons' && ('policy_id' in input || 'insured_person_id' in input)) throw new ApiError(422, 'Nao e permitido trocar os vinculos; desative e crie outro');
      const { data, error } = await db.from(table).update(input).eq('id', id).select().maybeSingle();
      sqlError(error); if (!data) throw new ApiError(404, 'Registro nao encontrado');
      return json({ data });
    }
    if (req.method === 'DELETE' && id && !action) {
      if (profile.role !== 'gestor') throw new ApiError(403, 'Somente gestor pode excluir definitivamente');
      // Por seguranca, remocao de documentos tambem exige limpeza manual do arquivo Storage, que fica privado.
      const { data, error } = await db.from(table).delete().eq('id', id).select('id').maybeSingle();
      sqlError(error); if (!data) throw new ApiError(404, 'Registro nao encontrado');
      return json({ success: true });
    }
    throw new ApiError(405, 'Metodo ou rota nao permitida');
  } catch (err) { return failed(err); }
});
