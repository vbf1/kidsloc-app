import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = req.headers.get('Authorization');
  if (!url || !anonKey || !serviceKey || !authorization) return json({ error: 'Configuração ou autenticação ausente.' }, 401);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: 'Sessão inválida. Entre novamente.' }, 401);

  let input: { companyId?: string; email?: string; role?: string };
  try { input = await req.json(); } catch { return json({ error: 'Corpo da requisição inválido.' }, 400); }
  const companyId = input.companyId;
  const email = input.email?.trim().toLowerCase();
  const role = input.role ?? 'staff';
  if (!companyId || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email ?? '') || !['admin', 'manager', 'staff'].includes(role)) {
    return json({ error: 'Informe empresa, e-mail válido e cargo permitido.' }, 400);
  }

  // A user cannot add their own account through the invitation flow.
  if (authData.user.email?.trim().toLowerCase() === email) {
    return json({ error: 'Você não pode convidar sua própria conta.' }, 409);
  }

  const [{ data: isOwner, error: ownerError }, { data: isAdmin, error: adminError }] = await Promise.all([
    userClient.rpc('has_company_role', { p_company_id: companyId, p_roles: ['owner'] }),
    userClient.rpc('has_company_role', { p_company_id: companyId, p_roles: ['admin'] }),
  ]);
  if (ownerError || adminError) return json({ error: 'Não foi possível validar suas permissões.' }, 403);
  if (!isOwner && !isAdmin) return json({ error: 'Somente proprietário ou administrador pode convidar membros.' }, 403);
  if (!isOwner && role !== 'staff') return json({ error: 'Administradores só podem adicionar funcionários.' }, 403);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let targetUser: { id: string } | null = null;
  let invited = false;

  // Resolve existing accounts before creating an invitation, avoiding duplicate auth users.
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return json({ error: 'Não foi possível localizar a conta pelo e-mail.' }, 500);
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) { targetUser = { id: match.id }; break; }
    if (data.users.length < 1000) break;
  }

  if (!targetUser) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email!);
    if (error || !data.user) return json({ error: 'Não foi possível enviar o convite. Verifique o endereço e tente novamente.' }, 400);
    targetUser = { id: data.user.id };
    invited = true;
  }

  // Also compare IDs, so aliases or differently-cased addresses cannot bypass self-invite protection.
  if (targetUser.id === authData.user.id) {
    return json({ error: 'Você não pode convidar sua própria conta.' }, 409);
  }

  // The database RPC repeats authorization and inserts atomically, without upserting
  // an existing membership or relying on a stale permission check.
  const { error: memberError } = await userClient.rpc('invite_company_member', {
    p_company_id: companyId,
    p_user_id: targetUser.id,
    p_role: role,
  });
  if (memberError) {
    if (memberError.code === '23505') {
      return json({ error: 'Este e-mail já está vinculado à equipe desta empresa.' }, 409);
    }
    if (memberError.code === '42501') {
      return json({ error: memberError.message || 'Você não tem permissão para convidar este membro.' }, 403);
    }
    return json({ error: invited ? 'O convite foi enviado, mas o vínculo não foi concluído. Peça ao proprietário para revisar a equipe.' : 'Não foi possível adicionar este usuário à equipe.' }, 400);
  }

  return json({ ok: true, invited, message: invited ? 'Convite enviado.' : 'Usuário vinculado à empresa.' });
});
