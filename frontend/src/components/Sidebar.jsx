import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, Smartphone, Send, Megaphone, Bot,
  History, KeyRound, BookText, Settings, LogOut, Sparkles
} from "lucide-react";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, id: "nav-dashboard" },
  { to: "/sessions", label: "Sessions", icon: Smartphone, id: "nav-sessions" },
  { to: "/send", label: "Send Message", icon: Send, id: "nav-send" },
  { to: "/broadcast", label: "Broadcast", icon: Megaphone, id: "nav-broadcast" },
  { to: "/auto-reply", label: "Auto-Reply", icon: Bot, id: "nav-auto-reply" },
  { to: "/history", label: "History", icon: History, id: "nav-history" },
  { to: "/keys", label: "API Keys", icon: KeyRound, id: "nav-api-keys" },
  { to: "/docs", label: "API Docs", icon: BookText, id: "nav-api-docs" },
  { to: "/settings", label: "Settings", icon: Settings, id: "nav-settings" },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <aside className="w-64 shrink-0 border-r border-zinc-200 bg-white/70 backdrop-blur-md flex flex-col" data-testid="sidebar">
      <div className="px-6 py-5 border-b border-zinc-200 flex items-center gap-2">
        <div className="size-7 rounded-md bg-zinc-900 text-white grid place-items-center">
          <Sparkles className="size-4" strokeWidth={2} />
        </div>
        <div>
          <div className="text-sm font-bold tracking-tight">WA Gateway</div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">v1.0</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ to, label, icon: Icon, id }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            data-testid={id}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`
            }
          >
            <Icon className="size-4" strokeWidth={1.75} />
            <span className="font-medium">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-zinc-200 px-3 py-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="size-8 rounded-full bg-zinc-900 text-white grid place-items-center text-xs font-semibold">
            {(user?.name || "U").slice(0,1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold truncate" data-testid="user-name">{user?.name}</div>
            <div className="text-[10px] font-mono text-zinc-500 truncate">{user?.email}</div>
          </div>
          <button
            data-testid="logout-button"
            onClick={() => { logout(); navigate("/login"); }}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
            title="Logout"
          >
            <LogOut className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </aside>
  );
}
