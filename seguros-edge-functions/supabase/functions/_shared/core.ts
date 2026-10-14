import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type Profile = { id: string; role: 'gestor' | 'editor'; is_active: boolean; full_name: string };
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}


export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
export function preflight(req: Request): Response | undefined {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
}
export function failed(error: unknown): Response {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  console.error(error);
  const msg = error instanceof Error ? error.message : 'Erro desconhecido';
  if (msg.includes('duplicate key') || msg.includes('unique constraint')) return json({ error: 'Registro duplicado ou violacao de unicidade' }, 409);
  if (msg.includes('foreign key') || msg.includes('violates check constraint') || msg.includes('Apolice PF exige') || msg.includes('Titular deve')) return json({ error: msg }, 422);
  return json({ error: 'Falha ao processar solicitacao' }, 500);
}
function env(name: string): string { const value = Deno.env.get(name); if (!value) throw new Error(`Variavel de ambiente ausente: ${name}`); return value; }
function publicKey(): string {
  const direct = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
  if (direct) return direct;
  const keys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (keys) { const parsed = JSON.parse(keys); return parsed.default || Object.values(parsed)[0] as string; }
  throw new Error('Chave publica do Supabase nao encontrada');
}
function secretKey(): string {
  const direct = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (direct) return direct;
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) { const parsed = JSON.parse(keys); return parsed.default || Object.values(parsed)[0] as string; }
  throw new Error('Chave de servico nao encontrada');
}
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function authorize(req: Request, manager = false): Promise<{ db: SupabaseClient; profile: Profile; userId: string }> {
  const header = req.headers.get('authorization') || '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) throw new ApiError(401, 'Token de acesso ausente');
  const key = publicKey();
  const db = createClient(env('SUPABASE_URL'), key, {
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Consulta ao Auth server: nunca confie no ID enviado pelo navegador.
  const { data: authData, error: authError } = await db.auth.getUser(match[1]);
  if (authError || !authData.user) throw new ApiError(401, 'Sessao invalida ou expirada');
  const { data, error } = await db.from('profiles').select('id,role,is_active,full_name').eq('id', authData.user.id).single();
  if (error || !data?.is_active) throw new ApiError(403, 'Usuario sem permissao ou inativo');
  if (manager && data.role !== 'gestor') throw new ApiError(403, 'Apenas gestores podem executar esta operacao');
  return { db, profile: data as Profile, userId: authData.user.id };
}
export async function body(req: Request): Promise<Record<string, unknown>> {
  if (!(req.headers.get('content-type') || '').toLowerCase().includes('application/json')) throw new ApiError(415, 'Envie Content-Type: application/json');
  const length = Number(req.headers.get('content-length') || 0);
  if (length > 64_000) throw new ApiError(413, 'JSON muito grande');
  let data: unknown;
  try { data = await req.json(); } catch { throw new ApiError(400, 'JSON invalido'); }
  if (data === null || Array.isArray(data) || typeof data !== 'object') throw new ApiError(400, 'JSON deve ser um objeto');
  return data as Record<string, unknown>;
}
export function requireKeys(input: Record<string, unknown>, allowed: readonly string[], required: readonly string[] = []): Record<string, unknown> {
  const keys = Object.keys(input);
  if (keys.some((k) => !allowed.includes(k))) throw new ApiError(400, `Campos nao permitidos: ${keys.filter((k) => !allowed.includes(k)).join(', ')}`);
  if (required.some((k) => input[k] === undefined || input[k] === null || input[k] === '')) throw new ApiError(422, `Campos obrigatorios: ${required.filter((k) => input[k] === undefined || input[k] === null || input[k] === '').join(', ')}`);
  if (keys.length === 0) throw new ApiError(400, 'Nenhum campo informado');
  return input;
}
export function sqlError(error: { message: string; code?: string } | null): void {
  if (!error) return;
  if (error.code === '23505') throw new ApiError(409, 'Ja existe um registro com este identificador');
  if (error.code === '23503' || error.code === '23514' || error.code === '22P02') throw new ApiError(422, error.message);
  if (error.code === '42501') throw new ApiError(403, 'Operacao nao permitida');
  throw new Error(`${error.code || ''}: ${error.message}`);
}
export function segments(req: Request, functionName: string): string[] {
  const url = new URL(req.url);
  const path = url.pathname.split('/').filter(Boolean);
  const idx = path.indexOf(functionName);
  return (idx < 0 ? path : path.slice(idx + 1)).map(decodeURIComponent);
}
export function uuid(value: string): void {
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value)) throw new ApiError(400, 'UUID invalido');
}
export function limitFrom(url: URL): { limit: number; offset: number } {
  const l = Number(url.searchParams.get('limit') || 20), o = Number(url.searchParams.get('offset') || 0);
  if (!Number.isInteger(l) || l < 1 || l > 100 || !Number.isInteger(o) || o < 0 || o > 100000) throw new ApiError(400, 'Paginacao invalida');
  return { limit: l, offset: o };
}
