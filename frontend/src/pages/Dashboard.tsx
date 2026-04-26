import { useAuth } from "../hooks/useAuth";

export function Dashboard() {
  const { user } = useAuth();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">
        Olá, {user?.name?.split(" ")[0]}!
      </h1>
      <p className="text-gray-500 text-sm">Bem-vindo ao MEI Completo.</p>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Agenda", desc: "Gerencie seus agendamentos e horários", href: "/agenda" },
          { label: "Financeiro", desc: "Controle suas receitas e despesas", href: "/financeiro" },
          { label: "Meu perfil", desc: "Atualize seus dados e preferências", href: "/perfil" },
        ].map((card) => (
          <a
            key={card.href}
            href={card.href}
            className="bg-white border border-gray-200 rounded-xl p-5 hover:border-brand-400 transition-colors"
          >
            <h2 className="font-semibold text-gray-800 mb-1">{card.label}</h2>
            <p className="text-sm text-gray-500">{card.desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
