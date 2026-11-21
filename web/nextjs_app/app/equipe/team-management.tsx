'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { SelectField } from '@/components/ui/select-field';
import { AppShell } from '@/components/app-shell';
import { WorkspaceModal } from '@/components/workspace-modal';

type Role = 'admin' | 'staff';
type Company = { id: string; name: string; role: Role };
type Member = { id: string; user_id: string; role: Role; created_at: string; name: string; phone: string | null };

const roleLabels: Record<Role, string> = {
  admin: 'Administrador', staff: 'Funcionário',
};

export default function TeamManagement() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const [sessionReady, setSessionReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const activeCompany = useMemo(() => companies.find((company) => company.id === companyId) ?? null, [companies, companyId]);
  const canManage = activeCompany?.role === 'admin';

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
    if (!supabase) {
      queueMicrotask(() => setSessionReady(true));
      return;
    }
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

  useEffect(() => {
    queueMicrotask(() => {
      void loadMembers().catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar a equipe.'));
    });
  }, [loadMembers]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) setError(signInError.message);
      else {
        setPassword('');
        setMessage('Login realizado.');
        await loadCompanies();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao entrar ou carregar empresas.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    setSigningOut(true); setError('');
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      setCompanies([]); setMembers([]); setUserEmail('');
      setMessage('Você saiu da sua conta.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível sair da conta.');
    } finally {
      setSigningOut(false);
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !companyId) return;
    const normalizedInviteEmail = inviteEmail.trim().toLowerCase();
    if (normalizedInviteEmail === userEmail.trim().toLowerCase()) {
      setError('Você não pode convidar sua própria conta.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const { data, error: inviteError } = await supabase.functions.invoke('invite-company-member', {
        body: { companyId, email: normalizedInviteEmail, role: 'staff' },
      });
      if (inviteError) {
        let detail = inviteError.message;
        const response = (inviteError as typeof inviteError & { context?: Response }).context;
        if (response) {
          try {
            const payload = await response.clone().json() as { error?: string };
            if (payload.error) detail = payload.error;
          } catch { /* Keep the SDK error when the response has no JSON body. */ }
        }
        throw new Error(detail);
      }
      setMessage(data?.invited ? 'Convite enviado por e-mail.' : 'Usuário adicionado à equipe.');
      setInviteEmail('');
      setInviteOpen(false);
      await loadMembers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir o convite.');
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: Member) {
    if (!supabase || !activeCompany || member.role === 'admin') return;
    setBusy(true); setError(''); setMessage('');
    try {
      const { error: deleteError } = await supabase.rpc('manage_company_member', {
        p_company_id: companyId, p_user_id: member.user_id, p_action: 'remove', p_role: null,
      });
      if (deleteError) throw deleteError;
      setMessage('Funcionário removido. O acesso aos dados da empresa foi revogado.');
      setMemberToRemove(null);
      await loadMembers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível remover o funcionário.');
    } finally {
      setBusy(false);
    }
  }

  if (!supabase) return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-bold">Configuração necessária</h1><p className="mt-3 text-gray-600">Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY para conectar o KidsLoc.</p></main>;
  if (!sessionReady) return <main className="grid min-h-screen place-items-center text-gray-500">Carregando…</main>;

  if (!userEmail) {
    return (
      <main className="kl-page">
        <div className="mx-auto max-w-md">
          {error && <div role="alert" className="kl-notice kl-notice-error mb-5"><span>{error}</span><button type="button" className="kl-notice-dismiss" aria-label="Fechar aviso" onClick={() => setError('')}>×</button></div>}
          {message && <div role="status" className="kl-notice kl-notice-success mb-5"><span>{message}</span><button type="button" className="kl-notice-dismiss" aria-label="Fechar aviso" onClick={() => setMessage('')}>×</button></div>}
          <section className="kl-card mt-12">
            <h1 className="text-2xl font-bold">Entrar no KidsLoc</h1><p className="mt-2 text-sm text-gray-500">Acesse sua conta para gerenciar os funcionários da empresa.</p>
            <form onSubmit={signIn} className="mt-6 space-y-4">
              <label className="block text-sm font-medium">E-mail<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
              <label className="block text-sm font-medium">Senha<input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
              <button disabled={busy} className="w-full rounded-xl bg-[#8054d8] px-4 py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Entrando…' : 'Entrar'}</button>
            </form>
          </section>
        </div>
      </main>
    );
  }

  return (
    <AppShell companyName={activeCompany?.name ?? 'KidsLoc'} email={userEmail} role={activeCompany?.role} basePath={basePath} signingOut={signingOut} onSignOut={signOut}>
      {error && <div role="alert" className="kl-notice kl-notice-error mb-5"><span>{error}</span><button type="button" className="kl-notice-dismiss" aria-label="Fechar aviso" onClick={() => setError('')}>×</button></div>}
      {message && <div role="status" className="kl-notice kl-notice-success mb-5"><span>{message}</span><button type="button" className="kl-notice-dismiss" aria-label="Fechar aviso" onClick={() => setMessage('')}>×</button></div>}
      {companies.length === 0 ? (
        <section className="kl-card"><h1 className="text-xl font-bold">Nenhuma empresa vinculada</h1><p className="mt-2 text-gray-600">Esta conta ainda não possui vínculo com uma empresa do KidsLoc.</p></section>
      ) : (
        <>
          <section className="kl-page-heading"><div><p className="kl-eyebrow">Administração</p><h1 className="kl-title">Equipe da empresa</h1><p className="kl-subtitle">Gerencie os acessos e os cargos dos colaboradores.</p></div><div className="w-full sm:w-64"><label className="kl-field-label">Empresa</label><SelectField ariaLabel="Empresa" value={companyId} onChange={setCompanyId} options={companies.map((company) => ({ value: company.id, label: company.name }))} /></div></section>
          <section className="kl-card mb-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Seu acesso</h2><p className="mt-1 text-sm text-gray-500">Cargo: {activeCompany ? roleLabels[activeCompany.role] : '—'}</p></div><span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-800">{members.length} membro(s)</span></div></section>
          {canManage && <section className="kl-card mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Adicionar funcionário</h2><p className="mt-1 text-sm text-gray-500">Convide alguém para acessar esta empresa.</p></div><button type="button" onClick={() => setInviteOpen(true)} className="kl-button-primary">Adicionar funcionário</button></section>}
          <WorkspaceModal open={inviteOpen} title="Adicionar funcionário" description="Enviaremos um convite para o e-mail informado. Se a pessoa já tiver conta, ela será vinculada à empresa." onClose={() => { if (!busy) setInviteOpen(false); }} size="md">
            <form onSubmit={invite} className="space-y-4"><label className="block text-sm font-semibold text-gray-700">E-mail do funcionário<input required type="email" autoComplete="email" placeholder="nome@empresa.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="kl-input mt-2" /></label><div className="flex justify-end gap-2 border-t border-gray-100 pt-4"><button type="button" disabled={busy} onClick={() => setInviteOpen(false)} className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700">Cancelar</button><button disabled={busy} className="kl-button-primary">{busy ? 'Enviando…' : 'Enviar convite'}</button></div></form>
          </WorkspaceModal>
          <WorkspaceModal open={Boolean(memberToRemove)} title="Remover funcionário?" description={memberToRemove ? 'Confirme a remoção de ' + memberToRemove.name + ' da empresa.' : ''} onClose={() => { if (!busy) setMemberToRemove(null); }} size="md">
            {memberToRemove && <div className="space-y-5"><div className="rounded-2xl border border-red-100 bg-red-50 p-4"><p className="text-sm font-semibold text-red-800">O acesso aos dados desta empresa será encerrado imediatamente.</p><p className="mt-1 text-xs text-red-700">Essa ação não exclui a conta da pessoa no KidsLoc.</p></div><div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setMemberToRemove(null)} className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700">Cancelar</button><button type="button" disabled={busy} onClick={() => void removeMember(memberToRemove)} className="rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Removendo…' : 'Confirmar remoção'}</button></div></div>}
          </WorkspaceModal>
          <section className="kl-card overflow-visible !p-0"><div className="border-b border-[#f0edf4] px-5 py-4"><h2 className="kl-card-title">Membros cadastrados</h2><p className="mt-1 text-xs text-gray-500">Pessoas com acesso à empresa</p></div>
            {members.length === 0 ? <p className="p-6 text-sm text-gray-500">Nenhum membro encontrado.</p> : <div className="divide-y">{members.map((member) => <div key={member.id} className="kl-member-row"><div className="min-w-0"><p className="font-medium">{member.name}</p><p className="mt-1 text-xs text-gray-500">{member.phone || 'Telefone não informado'} · Desde {new Date(member.created_at).toLocaleDateString('pt-BR')}</p></div>
              <div className="flex flex-wrap items-center gap-2">{member.role === 'owner' || !canManage || activeCompany?.role === 'admin' ? <><span className="rounded-full bg-gray-100 px-3 py-2 text-sm">{roleLabels[member.role]}</span>{activeCompany?.role === 'admin' && member.role === 'staff' && <button disabled={busy} onClick={() => setMemberToRemove(member)} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Remover</button>}</> : <><SelectField ariaLabel={`Cargo de ${member.name}`} value={member.role} onChange={(value) => void changeRole(member, value as Role)} className="min-w-36" options={[{ value: 'admin', label: 'Administrador' }, { value: 'staff', label: 'Funcionário' }]} /><button disabled={busy} onClick={() => setMemberToRemove(member)} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Remover</button></>}</div>
            </div>)}</div>}
          </section>
          <p className="mt-4 px-1 text-xs leading-5 text-gray-400">A remoção é aplicada no banco de dados; as políticas de segurança bloqueiam o acesso do membro removido aos dados da empresa.</p>
        </>
      )}
    </AppShell>
  );
}
