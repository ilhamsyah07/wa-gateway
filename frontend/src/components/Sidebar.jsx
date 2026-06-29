import {
  LayoutDashboard, Smartphone, Send, Megaphone, Bot,
  History, KeyRound, BookText, Settings, LogOut, Sparkles, Users
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useT } from "@/i18n/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { NavLink, useNavigate } from "react-router-dom";

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();

  const baseNav = [
    { to: "/", label: t("nav.dashboard"), icon: LayoutDashboard, id: "nav-dashboard" },
    { to: "/sessions", label: t("nav.sessions"), icon: Smartphone, id: "nav-sessions" },
    { to: "/send", label: t("nav.send"), icon: Send, id: "nav-send" },
    { to: "/broadcast", label: t("nav.broadcast"), icon: Megaphone, id: "nav-broadcast" },
    { to: "/auto-reply", label: t("nav.autoReply"), icon: Bot, id: "nav-auto-reply" },
    { to: "/history", label: t("nav.history"), icon: History, id: "nav-history" },
    { to: "/keys", label: t("nav.apiKeys"), icon: KeyRound, id: "nav-api-keys" },
    { to: "/docs", label: t("nav.apiDocs"), icon: BookText, id: "nav-api-docs" },
    { to: "/settings", label: t("nav.settings"), icon: Settings, id: "nav-settings" },
  ];
  const adminNavItem = { to: "/admin/users", label: t("nav.userApprovals"), icon: Users, id: "nav-admin-users" };
  const nav = user?.role === "admin" ? [...baseNav.slice(0, 6), adminNavItem, ...baseNav.slice(6)] : baseNav;

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

      <div className="border-t border-zinc-200 px-3 py-3 space-y-2">
        <div className="flex justify-end px-2">
          <LanguageSwitcher compact />
        </div>
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
            title={t("auth.logout")}
          >
            <LogOut className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </aside>
  );
}
