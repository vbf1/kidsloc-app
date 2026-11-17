'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';

type Role = 'owner' | 'admin' | 'manager' | 'staff';
type Company = { id: string; name: string; role: Role };
type Member = { id: string; user_id: string; role: Role; created_at: string; name: string; phone: string | null };

const roleLabels: Record<Role, string> = {
  owner: 'Proprietário', admin: 'Administrador', manager: 'Gerente', staff: 'Funcionário',
};

export default function TeamManagement() {\n  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const [sessionReady, setSessionReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('staff');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const activeCompany = useMemo(() => companies.find((company) => company.id === companyId) ?? null, [companies, companyId]);
  const canManage = activeCompany?.role === 'owner' || activeCompany?.role === 'admin';

  const loadCompanies = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setCompanies([]); setMembers([]); setUserEmail(''); return; }
    setUserEmail(auth.user.email ?? '');
    const { data, error: membershipError } = await supabase
      .from('company_members').select('company_id, role').eq('user_id', auth.user.id);
    if (membershipError) throw membershipError;
    const ids = (data ?? []).map((item) => item.company_id);
    if (!ids.length) { setCompanies([]); setMembers([]); setCompanyId(''); return; }
    const { data: companyRows, error: companyError } = await supabase
      .from('companies').select('id, name').in('id', ids).order('name');
    if (companyError) throw companyError;
    const next = (companyRows ?? []).map((company) => ({
      id: company.id, name: company.name,
      role: (data ?? []).find((item) => item.company_id === company.id)?.role as Role,
    }));
    setCompanies(next);
    setCompanyId((current) => next.some((item) => item.id === current) ? current : next[0]?.id ?? '');
  }, []);

  const loadMembers = useCallback(async () => {
    if (!supabase || !companyId) { setMembers([]); return; }
    const { data, error: memberError } = await supabase
      .from('company_members').select('id, user_id, role, created_at')
      .eq('company_id', companyId).order('created_at');
    if (memberError) throw memberError;
    const ids = (data ?? []).map((item) => item.user_id);
    const { data: profiles, error: profileError } = ids.length
      ? await supabase.from('profiles').select('id, full_name, phone').in('id', ids)
      : { data: [], error: null };
    if (profileError) throw profileError;
    setMembers((data ?? []).map((item) => {
      const profile = (profiles ?? []).find((entry) => entry.id === item.user_id);
      return { ...item, role: item.role as Role, name: profile?.full_name || 'Usuário sem nome', phone: profile?.phone ?? null };
    }));
  }, [companyId]);

  useEffect(() => {
    if (!supabase) { setSessionReady(true); return; }
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session && mounted) {
        try { await loadCompanies(); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar as empresas.'); }
      }
      if (mounted) setSessionReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (!session) { setCompanies([]); setMembers([]); setUserEmail(''); }
      else { queueMicrotask(() => loadCompanies().catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar empresas.'))); }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [loadCompanies]);

  useEffect(() => { loadMembers().catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar a equipe.')); }, [loadMembers]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setError(''); setMessage('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError(signInError.message);
    else { setPassword(''); setMessage('Login realizado.'); try { await loadCompanies(); } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao carregar empresas.'); } }
    setBusy(false);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setCompanies([]); setMembers([]); setMessage('Você saiu da sua conta.');
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !companyId) return;
    setBusy(true); setError(''); setMessage('');
    const { data, error: inviteError } = await supabase.functions.invoke('invite-company-member', {
      body: { companyId, email: inviteEmail.trim(), role: inviteRole },
    });
    if (inviteError) setError(inviteError.message);
    else {
      setMessage(data?.invited ? 'Convite enviado por e-mail.' : 'Usuário adicionado à equipe.');
      setInviteEmail('');
      try { await loadMembers(); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível atualizar a equipe.'); }
    }
    setBusy(false);
  }

  async function changeRole(member: Member, role: Role) {
    if (!supabase || !companyId || !activeCompany) return;
    setBusy(true); setError(''); setMessage('');
    const { error: updateError } = await supabase.rpc('add_company_member', {
      p_company_id: companyId, p_user_id: member.user_id, p_role: role,
    });
    if (updateError) setError(updateError.message);
    else { setMessage('Cargo atualizado.'); await loadMembers(); }
    setBusy(false);
  }

  async function removeMember(member: Member) {
    if (!supabase || !activeCompany || member.role === 'owner') return;
    if (!window.confirm(`Remover ${member.name} da empresa? O acesso aos dados desta empresa será encerrado imediatamente.`)) return;
    setBusy(true); setError(''); setMessage('');
    const { error: deleteError } = await supabase.from('company_members').delete().eq('id', member.id).eq('company_id', companyId);
    if (deleteError) setError(deleteError.message);
    else { setMessage('Funcionário removido. O acesso aos dados da empresa foi revogado.'); await loadMembers(); }
    setBusy(false);
  }

  if (!supabase) return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-bold">Configuração necessária</h1><p className="mt-3 text-gray-600">Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY para conectar o KidsLoc.</p></main>;
  if (!sessionReady) return <main className="grid min-h-screen place-items-center text-gray-500">Carregando…</main>;

  return (
    <main className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <a href={`${basePath}/`} className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-[#8054d8] text-xl font-black text-white">K</span><span><strong className="block text-lg">KidsLoc</strong><span className="text-xs text-gray-500">Gestão de equipe</span></span></a>
          {userEmail && <div className="flex items-center gap-3 text-sm"><span className="max-w-52 truncate text-gray-600">{userEmail}</span><button onClick={signOut} className="rounded-xl border px-3 py-2 hover:bg-gray-50">Sair</button></div>}
        </header>
        {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</p>}
        {!userEmail ? (
          <section className="mx-auto mt-12 max-w-md rounded-3xl border bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-2xl font-bold">Entrar no KidsLoc</h1><p className="mt-2 text-sm text-gray-500">Acesse sua conta para gerenciar os funcionários da empresa.</p>
            <form onSubmit={signIn} className="mt-6 space-y-4">
              <label className="block text-sm font-medium">E-mail<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
              <label className="block text-sm font-medium">Senha<input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
              <button disabled={busy} className="w-full rounded-xl bg-[#8054d8] px-4 py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Entrando…' : 'Entrar'}</button>
            </form>
          </section>
        ) : companies.length === 0 ? (
          <section className="rounded-3xl border bg-white p-8"><h1 className="text-xl font-bold">Nenhuma empresa vinculada</h1><p className="mt-2 text-gray-600">Esta conta ainda não possui vínculo com uma empresa do KidsLoc.</p></section>
        ) : (
          <>
            <section className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#8054d8]">ADMINISTRAÇÃO</p><h1 className="mt-1 text-3xl font-bold">Equipe da empresa</h1><p className="mt-2 text-gray-500">Gerencie os acessos e os cargos dos colaboradores.</p></div>
              <label className="min-w-56 text-sm font-medium">Empresa<select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="mt-1 w-full rounded-xl border bg-white px-3 py-3">{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
            </section>
            <section className="mb-6 rounded-2xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Seu acesso</h2><p className="mt-1 text-sm text-gray-500">Cargo: {activeCompany ? roleLabels[activeCompany.role] : '—'}</p></div><span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-800">{members.length} membro(s)</span></div></section>
            {canManage && <section className="mb-6 rounded-2xl border bg-white p-5"><h2 className="font-semibold">Adicionar funcionário</h2><p className="mt-1 text-sm text-gray-500">Enviaremos um convite para o e-mail informado. Se a pessoa já tiver conta, ela será vinculada à empresa.</p>
              <form onSubmit={invite} className="mt-4 grid gap-3 sm:grid-cols-[1fr_190px_auto]"><input required type="email" placeholder="E-mail do funcionário" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="min-w-0 rounded-xl border px-3 py-3" /><select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} className="rounded-xl border bg-white px-3 py-3"><option value="staff">Funcionário</option>{activeCompany?.role === 'owner' && <><option value="manager">Gerente</option><option value="admin">Administrador</option></>}</select><button disabled={busy} className="rounded-xl bg-[#8054d8] px-5 py-3 font-semibold text-white disabled:opacity-60">Enviar convite</button></form>
            </section>}
            <section className="overflow-hidden rounded-2xl border bg-white"><div className="border-b px-5 py-4"><h2 className="font-semibold">Membros cadastrados</h2></div>
              {members.length === 0 ? <p className="p-6 text-sm text-gray-500">Nenhum membro encontrado.</p> : <div className="divide-y">{members.map((member) => <div key={member.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-medium">{member.name}</p><p className="mt-1 text-xs text-gray-500">{member.phone || 'Telefone não informado'} · Desde {new Date(member.created_at).toLocaleDateString('pt-BR')}</p></div>
                <div className="flex flex-wrap items-center gap-2">{member.role === 'owner' || !canManage || (activeCompany?.role === 'admin' && member.role !== 'staff') ? <span className="rounded-full bg-gray-100 px-3 py-2 text-sm">{roleLabels[member.role]}</span> : <><select aria-label={`Cargo de ${member.name}`} disabled={busy} value={member.role} onChange={(e) => changeRole(member, e.target.value as Role)} className="rounded-xl border bg-white px-3 py-2 text-sm">{activeCompany?.role === 'owner' && <><option value="admin">Administrador</option><option value="manager">Gerente</option></>}<option value="staff">Funcionário</option></select><button disabled={busy} onClick={() => removeMember(member)} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Remover</button></>}</div>
              </div>)}</div>}
            </section>
            <p className="mt-4 text-xs text-gray-400">A remoção é aplicada no banco de dados; as políticas de segurança bloqueiam o acesso do membro removido aos dados da empresa.</p>
          </>
        )}
      </div>
    </main>
  );
}
