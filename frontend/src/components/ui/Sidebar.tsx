import { LayoutDashboard, Receipt, Calendar, User } from "lucide-react";

interface SidebarProps {
  activeRoute: string;
  onNavigate: (path: string) => void;
  userName?: string;
}

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Receipt,         label: "Financeiro", path: "/financeiro" },
  { icon: Calendar,        label: "Agenda",     path: "/agenda" },
  { icon: User,            label: "Perfil",     path: "/perfil" },
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export function Sidebar({ activeRoute, onNavigate, userName = "" }: SidebarProps) {
  const initials = userName ? getInitials(userName) : "U";

  return (
    <>
      {/* Desktop sidebar — fixed left column */}
      <aside className="hidden md:flex flex-col items-center fixed left-0 top-0 h-screen w-[52px] bg-sidebar z-30 py-3 gap-3">
        {/* Logo */}
        <button
          onClick={() => onNavigate("/dashboard")}
          aria-label="Ir para Dashboard"
          className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center text-white font-bold text-sm mb-2 hover:bg-brand-dark transition-colors"
        >
          M
        </button>

        {/* Nav items */}
        <nav className="flex flex-col items-center gap-1 flex-1">
          {navItems.map(({ icon: Icon, label, path }) => {
            const isActive = activeRoute === path || activeRoute.startsWith(path + "/");
            return (
              <button
                key={path}
                onClick={() => onNavigate(path)}
                aria-label={label}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  isActive
                    ? "bg-brand/20 text-brand"
                    : "text-[#A8A8C0] hover:text-white hover:bg-white/10"
                }`}
              >
                <Icon size={18} />
              </button>
            );
          })}
        </nav>

        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full bg-brand/30 flex items-center justify-center text-white text-xs font-bold"
          aria-label={`Usuário: ${userName}`}
        >
          {initials}
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-white border-t border-gray-100 flex items-center justify-around z-30">
        {navItems.map(({ icon: Icon, label, path }) => {
          const isActive = activeRoute === path || activeRoute.startsWith(path + "/");
          return (
            <button
              key={path}
              onClick={() => onNavigate(path)}
              aria-label={label}
              className={`flex flex-col items-center justify-center gap-0.5 px-3 ${
                isActive ? "text-brand" : "text-gray-400"
              }`}
            >
              <Icon size={20} />
              <span className="text-[10px]">{label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
