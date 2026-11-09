import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen px-5 py-10 md:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-[#8054d8] text-xl font-black text-white">K</div>
            <div><p className="text-xl font-bold tracking-tight">KidsLoc <span className="text-[#8054d8]">App</span></p><p className="text-xs text-gray-500">Gestão inteligente para eventos</p></div>
          </div>
          <Link href="/login/" className="rounded-xl bg-[#8054d8] px-5 py-3 text-sm font-semibold text-white hover:bg-[#6d43c2]">Entrar</Link>
        </header>
        <section className="mt-16 grid gap-10 md:grid-cols-[1.2fr_.8fr] md:items-center">
          <div>
            <span className="rounded-full bg-purple-100 px-3 py-1 text-sm font-semibold text-purple-800">Bem-vindo ao KidsLoc</span>
            <h1 className="mt-5 max-w-2xl text-4xl font-bold leading-tight md:text-6xl">Sua locadora organizada. <span className="text-[#8054d8]">Seus eventos no controle.</span></h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-gray-600">Uma plataforma para administrar clientes, brinquedos, agenda, reservas e pagamentos em um só lugar.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup/" className="rounded-xl bg-[#8054d8] px-5 py-3 text-sm font-semibold text-white hover:bg-[#6d43c2]">Criar minha conta</Link>
              <Link href="/login/" className="rounded-xl border border-purple-200 bg-white px-5 py-3 text-sm font-semibold text-[#8054d8]">Já tenho conta</Link>
            </div>
            <p className="mt-8 text-sm text-gray-500">Fundação do produto · Ambiente de desenvolvimento</p>
          </div>
          <div className="rounded-3xl border border-purple-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between"><p className="font-semibold">Visão geral</p><span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-900">Prévia</span></div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[['Reservas','—'],['Clientes','—'],['A receber','R$ —'],['Itens ativos','—']].map(([label,value]) => <div key={label} className="rounded-2xl bg-[#faf9fd] p-4"><p className="text-sm text-gray-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}
            </div>
            <p className="mt-5 text-xs text-gray-400">Os indicadores serão conectados ao Supabase nas próximas etapas.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
