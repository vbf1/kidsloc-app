'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';
import { useResponsivePageSize } from '../../../../lib/use-responsive-page-size';

type PlatformUser = {
  id: string; name: string; email: string; phone: string; role: string; company: string;
  registered_at: string; last_sign_in_at: string | null; email_confirmed_at: string | null;
  memberships: { company: string; role: string }[];
};
function formatRoleLabel(role: string) {
  const labels: Record<string, string> = { platform_owner: 'Proprietário da plataforma', admin: 'Administrador', staff: 'Funcionário' };
  return labels[role.toLowerCase()] ?? role;
}
function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').trim();
}

export default function PlatformUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [emailFilter, setEmailFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const pageSize = useResponsivePageSize();
  const [pagination, setPagination] = useState({ page: 0, pageSize: 6 });
  const currentPage = pagination.pageSize === pageSize ? pagination.page : 0;

  const loadUsers = useCallback(async () => {
    if (!supabase) { setError('O acesso ainda não está configurado.'); setLoading(false); return; }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) { router.replace('/login/'); return; }
    const { data: isOwner, error: ownerError } = await supabase.rpc('is_platform_owner_for_company');
    if (ownerError || isOwner !== true) { router.replace('/app/'); return; }
    const { data, error: invokeError } = await supabase.functions.invoke('manage-employees', { body: { action: 'list_users' } });
    if (invokeError || data?.error) { setError(data?.error || 'Não foi possível carregar os usuários cadastrados.'); setUsers([]); }
    else { setUsers((data?.users ?? []) as PlatformUser[]); setError(''); }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void loadUsers(); });
    return () => window.cancelAnimationFrame(frame);
  }, [loadUsers]);

  const filteredUsers = useMemo(() => users.filter((user) => {
    const text = [user.name, user.email, user.phone, user.company, user.role,
      ...user.memberships.map((membership) => membership.company + ' ' + membership.role)].join(' ');
    const matchesSearch = !search.trim() || normalize(text).includes(normalize(search));
    const matchesRole = roleFilter === 'all' || user.role === roleFilter || user.memberships.some((membership) => membership.role === roleFilter);
    const matchesEmail = emailFilter === 'all' || (emailFilter === 'confirmed' ? Boolean(user.email_confirmed_at) : !user.email_confirmed_at);
    return matchesSearch && matchesRole && matchesEmail;
  }), [users, search, roleFilter, emailFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const visibleUsers = filteredUsers.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  function changeFilter(setter: (value: string) => void, value: string) { setter(value); setPagination({ page: 0, pageSize }); }

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    await loadUsers();
    setRefreshing(false);
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc]"><p className="rounded-2xl border border-purple-100 bg-white px-6 py-5 text-sm text-gray-600">Verificando acesso administrativo...</p></main>;

  return (
    <main className="min-h-screen bg-[#f8f7fc] text-gray-900">
      <header className="border-b border-purple-100 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/app/admin/" className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8054d8]">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#8054d8] text-xl font-black text-white">K</span>
            <span><span className="block text-xl font-bold">KidsLoc <span className="text-[#8054d8]">Admin</span></span><span className="block text-xs text-gray-500">Proprietário da plataforma</span></span>
          </Link>
          <Link href="/app/admin/" className="shrink-0 rounded-xl border border-purple-200 px-3 py-2 text-sm font-semibold text-[#6840bd] hover:bg-purple-50">Voltar ao painel</Link>
        </div>
      </header>
      <div className="kl-workspace-refresh kl-platform-admin mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <section className="kl-admin-hero">
          <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="kl-admin-eyebrow">CENTRAL DE CONTROLE · KIDSLOC</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-[2.15rem]">Usuários da plataforma</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">Consulte contas cadastradas, empresas vinculadas e atividade de acesso.</p></div>
            <button type="button" onClick={() => void refresh()} disabled={refreshing} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#6840bd] shadow-sm hover:bg-purple-50 disabled:opacity-60">{refreshing ? 'Atualizando...' : 'Atualizar lista'}</button>
          </div><div className="kl-admin-hero-orb" aria-hidden="true" />
        </section>
        <section className="rounded-[22px] border border-[#ebe6f3] bg-white p-4 shadow-[0_8px_28px_rgba(39,24,70,0.045)] sm:p-6">
          <div><h2 className="text-lg font-bold text-[#29213b]">Todos os usuários</h2><p className="mt-1 text-sm text-gray-500">{filteredUsers.length} de {users.length} conta(s)</p></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1.5fr)_minmax(180px,1fr)_minmax(180px,1fr)]">
            <label className="text-xs font-bold text-[#514a61]">Buscar usuário<input value={search} onChange={(event) => changeFilter(setSearch,event.target.value)} placeholder="Nome, e-mail, telefone ou empresa..." className="mt-1 min-h-11 w-full rounded-xl border border-gray-200 px-3 text-sm font-normal" /></label>
            <label className="text-xs font-bold text-[#514a61]">Perfil<select value={roleFilter} onChange={(event) => changeFilter(setRoleFilter,event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-normal"><option value="all">Todos os perfis</option><option value="platform_owner">Proprietário</option><option value="admin">Administrador</option><option value="staff">Funcionário</option></select></label>
            <label className="text-xs font-bold text-[#514a61]">Confirmação de e-mail<select value={emailFilter} onChange={(event) => changeFilter(setEmailFilter,event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-normal"><option value="all">Todas as situações</option><option value="confirmed">Confirmado</option><option value="pending">Pendente</option></select></label>
          </div>
          <p className="mt-3 text-xs text-gray-400">Consulta global somente leitura. Nenhuma senha, token ou dado de autenticação sensível é exibido.</p>
          {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {loading ? <p className="mt-5 text-sm text-gray-500">Carregando usuários cadastrados...</p> : visibleUsers.length ? <>
            <div className="mt-5 hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-left text-sm">
              <thead><tr className="border-b border-gray-100 text-xs uppercase text-gray-500"><th className="px-3 py-3">Usuário</th><th className="px-3 py-3">E-mail</th><th className="px-3 py-3">Telefone</th><th className="px-3 py-3">Empresa / perfil</th><th className="px-3 py-3">Cadastro</th><th className="px-3 py-3">Último acesso</th></tr></thead>
              <tbody>{visibleUsers.map((user) => <tr key={user.id} className="border-b border-gray-50 align-top">
                <td className="px-3 py-3 font-semibold">{user.name || 'Nome não informado'}<span className="mt-1 block text-xs font-normal text-gray-400">{user.email_confirmed_at ? 'E-mail confirmado' : 'E-mail não confirmado'}</span></td><td className="px-3 py-3">{user.email || '—'}</td><td className="px-3 py-3">{user.phone || '—'}</td>
                <td className="px-3 py-3"><div className="space-y-1">{user.role === 'platform_owner' && <div className="font-semibold text-[#6840bd]">Proprietário da plataforma</div>}{user.memberships.length ? user.memberships.map((membership,index) => <div key={membership.company + membership.role + index}><span className="font-medium">{membership.company}</span><span className="ml-2 text-xs text-gray-500">{formatRoleLabel(membership.role)}</span></div>) : user.role !== 'platform_owner' ? <span className="text-gray-400">{user.company || 'Sem empresa vinculada'}</span> : null}</div></td>
                <td className="whitespace-nowrap px-3 py-3">{user.registered_at ? new Date(user.registered_at).toLocaleDateString('pt-BR') : '—'}</td><td className="whitespace-nowrap px-3 py-3">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('pt-BR') : 'Nunca acessou'}</td>
              </tr>)}</tbody></table></div>
            <div className="mt-4 grid gap-3 md:hidden">{visibleUsers.map((user) => <article key={user.id} className="min-w-0 rounded-2xl border border-[#ebe6f3] bg-white p-4 shadow-[0_4px_14px_rgba(39,24,70,0.04)]">
              <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-bold text-[#29213b]">{user.name || 'Nome não informado'}</h3><p className="mt-1 break-all text-xs leading-5 text-[#625b70]">{user.email || 'E-mail não informado'}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${user.email_confirmed_at ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{user.email_confirmed_at ? 'Confirmado' : 'Pendente'}</span></div>
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-[#f0edf5] pt-3"><div><p className="text-[10px] font-bold uppercase tracking-wide text-[#918a9e]">Telefone</p><p className="mt-1 break-words text-xs font-medium text-[#40394f]">{user.phone || '—'}</p></div><div><p className="text-[10px] font-bold uppercase tracking-wide text-[#918a9e]">Cadastro</p><p className="mt-1 text-xs font-medium text-[#40394f]">{user.registered_at ? new Date(user.registered_at).toLocaleDateString('pt-BR') : '—'}</p></div>
                <div className="col-span-2"><p className="text-[10px] font-bold uppercase tracking-wide text-[#918a9e]">Empresa / perfil</p><div className="mt-1 space-y-1 text-xs text-[#40394f]">{user.role === 'platform_owner' && <p className="font-semibold text-[#6840bd]">Proprietário da plataforma</p>}{user.memberships.length ? user.memberships.map((membership,index) => <p key={membership.company + membership.role + index}><span className="font-semibold">{membership.company}</span><span className="ml-2 text-[#777187]">{formatRoleLabel(membership.role)}</span></p>) : user.role !== 'platform_owner' ? <p>{user.company || 'Sem empresa vinculada'}</p> : null}</div></div>
                <div className="col-span-2"><p className="text-[10px] font-bold uppercase tracking-wide text-[#918a9e]">Último acesso</p><p className="mt-1 text-xs font-medium text-[#40394f]">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('pt-BR') : 'Nunca acessou'}</p></div>
              </div></article>)}</div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#f0edf5] pt-4"><p className="text-xs text-gray-500">Exibindo {visibleUsers.length} de {filteredUsers.length} usuário(s).</p><div className="flex items-center gap-2">
              <button type="button" disabled={currentPage===0} onClick={() => setPagination({page:currentPage-1,pageSize})} className="rounded-xl border border-purple-200 px-3 py-2 text-xs font-bold text-[#6840bd] disabled:opacity-40">Anterior</button><span className="text-xs font-semibold text-gray-500">Página {currentPage+1} de {totalPages}</span><button type="button" disabled={currentPage+1>=totalPages} onClick={() => setPagination({page:currentPage+1,pageSize})} className="rounded-xl border border-purple-200 px-3 py-2 text-xs font-bold text-[#6840bd] disabled:opacity-40">Próxima</button>
            </div></div>
          </> : <p className="mt-5 rounded-xl bg-[#faf8fd] px-4 py-8 text-center text-sm text-gray-500">{users.length ? 'Nenhum usuário corresponde aos filtros.' : 'Nenhum usuário cadastrado foi encontrado.'}</p>}
        </section>
      </div>
    </main>
  );
}
