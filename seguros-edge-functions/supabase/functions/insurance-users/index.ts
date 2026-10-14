import { adminClient, ApiError, authorize, body, failed, json, limitFrom, preflight, requireKeys, segments, sqlError, uuid } from '../_shared/core.ts';

Deno.serve(async (req) => {
  const cors = preflight(req); if (cors) return cors;
  try {
    const { db, userId } = await authorize(req, true);
    const admin = adminClient();
    const [id, action] = segments(req, 'insurance-users');
    const url = new URL(req.url);
    if (id) uuid(id);
    if (req.method === 'GET' && !id) {
      const { limit, offset } = limitFrom(url);
      const { data, count, error } = await db.from('profiles').select('id,full_name,role,is_active,created_at,created_by', { count: 'exact' }).order('created_at', { ascending: false }).range(offset,offset+limit-1);
      sqlError(error); return json({ data, pagination: { total: count, limit, offset } });
    }
    if (req.method === 'GET' && id && !action) {
      const { data, error } = await db.from('profiles').select('id,full_name,role,is_active,created_at,created_by').eq('id',id).maybeSingle();
      sqlError(error); if (!data) throw new ApiError(404, 'Perfil inexistente');
      return json({ data });
    }
    if (req.method === 'POST' && !id) {
      const input = requireKeys(await body(req), ['email','password','full_name'], ['email','password','full_name']);
      const email = String(input.email).toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(422, 'Email invalido');
      const password = String(input.password);
      if (password.length < 12 || password.length > 128) throw new ApiError(422, 'Senha precisa ter entre 12 e 128 caracteres');
      if (typeof input.full_name !== 'string' || !input.full_name.trim()) throw new ApiError(422, 'Nome obrigatorio');
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: false, user_metadata: { full_name: String(input.full_name) } });
      if (error || !data.user) throw new ApiError(422, error?.message || 'Nao foi possivel criar usuario');
      // Trigger SQL cria profile inativo; usuario so e ativado APOS a verificacao da transacao.
      const { data: profile, error: updateError } = await db.from('profiles').update({ full_name: String(input.full_name), role: 'editor', is_active: true, created_by: userId }).eq('id',data.user.id).select('id,full_name,role,is_active').single();
      if (updateError) {
        // Compensacao: evita deixar usuario Auth parcialmente provisionado.
        const { error: cleanupError } = await admin.auth.admin.deleteUser(data.user.id);
        if (cleanupError) console.error('Falha de compensacao do usuario', data.user.id, cleanupError);
        sqlError(updateError);
      }
      return json({ data: profile, email, message: 'Usuario criado; confirme o email antes de entrar' }, 201);
    }
    if (req.method === 'PATCH' && id && !action) {
      const input = requireKeys(await body(req), ['full_name','is_active']);
      if ('is_active' in input && typeof input.is_active !== 'boolean') throw new ApiError(422,'is_active precisa ser booleano');
      if ('full_name' in input && (typeof input.full_name !== 'string' || !input.full_name.trim())) throw new ApiError(422,'Nome invalido');
      const { data: target, error: targetError } = await db.from('profiles').select('role').eq('id',id).maybeSingle();
      sqlError(targetError); if (!target) throw new ApiError(404, 'Perfil inexistente');
      if (target.role !== 'editor') throw new ApiError(403, 'Este modulo gerencia apenas editores');
      const { data, error } = await db.from('profiles').update(input).eq('id',id).select('id,full_name,role,is_active').maybeSingle();
      sqlError(error); if (!data) throw new ApiError(404, 'Perfil inexistente');
      return json({ data });
    }
    if (req.method === 'DELETE' && id && !action) {
      // Nunca excluir Auth antes de verificar se o perfil pode ser excluido (ultimo gestor).
      const { data: profile, error } = await db.from('profiles').select('id,role,is_active').eq('id',id).maybeSingle();
      sqlError(error); if (!profile) throw new ApiError(404,'Usuario nao encontrado');
      if (profile.role !== 'editor') throw new ApiError(403,'Este modulo gerencia apenas editores');
      if (profile.is_active) throw new ApiError(409,'Desative o usuario antes de exclui-lo');
      // Primeiro apaga profile (o FK profiles.id -> auth.users.id e RESTRICT).
      // O trigger de banco impede excluir o ultimo gestor ativo.
      const { error: profileDeleteError } = await db.from('profiles').delete().eq('id', id);
      sqlError(profileDeleteError);
      const { error: authDeleteError } = await admin.auth.admin.deleteUser(id);
      if (authDeleteError) {
        console.error('Perfil removido, mas falhou exclusao no Auth. Limpeza manual necessaria:', id, authDeleteError);
        throw new ApiError(502,'Perfil removido, mas exclusao no Auth falhou. Contate o administrador para concluir a limpeza');
      }
      return json({ success: true });
    }
    throw new ApiError(405,'Metodo ou rota nao permitida');
  } catch (err) { return failed(err); }
});
