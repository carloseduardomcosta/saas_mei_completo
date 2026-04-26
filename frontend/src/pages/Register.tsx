import { useState, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import toast, { Toaster } from "react-hot-toast";
import { Check } from "lucide-react";

export function Register() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({
    name: "",
    cpfCnpj: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/register", {
        name: form.name,
        email: form.email,
        password: form.password,
      });
      await login(form.email, form.password);
      navigate("/agenda");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  };

  const benefits = [
    "Termômetro do limite MEI",
    "Alerta do DAS automático",
    "Cobrança Pix sem complicação",
  ];

  return (
    <>
      <Toaster position="top-center" />
      <div className="flex min-h-screen">
        {/* Left panel — desktop only */}
        <div className="hidden md:flex flex-col w-2/5 bg-sidebar p-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand rounded-xl flex items-center justify-center text-white font-bold text-2xl">
              M
            </div>
            <span className="text-white font-semibold text-lg">MEI Completo</span>
          </div>
          <p className="text-white text-lg font-medium mt-8">
            Seu negócio organizado em 1 lugar
          </p>
          <div className="mt-8 flex flex-col gap-4">
            {benefits.map((b) => (
              <div key={b} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center flex-shrink-0">
                  <Check size={16} className="text-brand" />
                </div>
                <span className="text-white/80 text-sm">{b}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile top bar */}
        <div className="md:hidden fixed top-0 left-0 right-0 h-[120px] bg-sidebar flex items-center px-6 gap-3 z-10">
          <div className="w-9 h-9 bg-brand rounded-xl flex items-center justify-center text-white font-bold text-xl">
            M
          </div>
          <span className="text-white font-semibold text-lg">MEI Completo</span>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex items-center justify-center bg-white px-8 pt-[140px] pb-8 md:pt-0">
          <div className="w-full max-w-sm">
            <h1 className="text-lg font-medium text-gray-900">Criar conta grátis</h1>
            <p className="text-sm text-gray-500 mt-1">Comece a organizar seu MEI hoje</p>

            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
              <div>
                <label htmlFor="reg-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Nome completo
                </label>
                <input
                  id="reg-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={set("name")}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  placeholder="João da Silva"
                />
              </div>

              <div>
                <label htmlFor="reg-cpf" className="block text-sm font-medium text-gray-700 mb-1">
                  CPF / CNPJ
                </label>
                <input
                  id="reg-cpf"
                  type="text"
                  value={form.cpfCnpj}
                  onChange={set("cpfCnpj")}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  placeholder="000.000.000-00 ou 00.000.000/0001-00"
                />
              </div>

              <div>
                <label htmlFor="reg-email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={set("email")}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  placeholder="voce@email.com"
                />
              </div>

              <div>
                <label htmlFor="reg-password" className="block text-sm font-medium text-gray-700 mb-1">
                  Senha
                </label>
                <input
                  id="reg-password"
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={set("password")}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  placeholder="Mínimo 8 caracteres"
                />
              </div>

              <div>
                <label htmlFor="reg-confirm" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirmar senha
                </label>
                <input
                  id="reg-confirm"
                  type="password"
                  required
                  value={form.confirmPassword}
                  onChange={set("confirmPassword")}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  placeholder="Repita a senha"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full bg-brand hover:bg-brand-dark text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {loading ? "Criando conta..." : "Criar minha conta"}
              </button>
            </form>

            <p className="text-sm text-gray-500 text-center mt-3">
              Já tenho conta?{" "}
              <Link to="/login" className="text-brand font-medium hover:underline">
                Entrar
              </Link>
            </p>
            <p className="text-xs text-gray-400 mt-4 text-center">
              Ao criar sua conta você concorda com os Termos de Uso
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
