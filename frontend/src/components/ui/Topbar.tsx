import { Badge } from "./Badge";

interface TopbarProps {
  userName: string;
  statusLabel?: string;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function getDateLabel(): string {
  return new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export function Topbar({ userName, statusLabel = "Ativo" }: TopbarProps) {
  const firstName = userName?.split(" ")[0] || "Usuário";
  const initials = userName ? getInitials(userName) : "U";

  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm font-semibold text-gray-900">
          {getGreeting()}, {firstName}!
        </p>
        <p className="text-xs text-gray-400 capitalize">{getDateLabel()}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="green">{statusLabel}</Badge>
        <div
          className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-white text-xs font-bold"
          aria-label={`Usuário: ${userName}`}
        >
          {initials}
        </div>
      </div>
    </div>
  );
}
