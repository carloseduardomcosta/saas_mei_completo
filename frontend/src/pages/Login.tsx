import { useState, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import toast, { Toaster } from "react-hot-toast";
import { Check } from "lucide-react";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate("/agenda");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao fazer login");
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
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand rounded-xl flex items-center justify-center text-white font-bold text-2xl">
              M
            </div>
            <span className="text-white font-semibold text-lg">MEI Completo</span>
          </div>

          {/* Headline */}
          <p className="text-white text-lg font-medium mt-8">
            Seu negócio organizado em 1 lugar
          </p>

          {/* Benefits */}
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
        <div className="flex-1 flex items-center justify-center bg-white px-8 pt-[140px] md:pt-0">
          <div className="w-full max-w-sm">
            <h1 className="text-lg font-medium text-gray-900">Bem-vindo de volta</h1>
            <p className="text-sm text-gray-500 mt-1">Entre na sua conta MEI Completo</p>

            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  placeholder="voce@email.com"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">
                  Senha
                </label>
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full bg-brand hover:bg-brand-dark text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </form>

            <p className="text-sm text-gray-500 text-center mt-3">
              Não tem conta?{" "}
              <Link to="/registro" className="text-brand font-medium hover:underline">
                Criar grátis
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
