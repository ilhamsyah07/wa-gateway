import { useAuth } from "@/contexts/AuthContext";
import { useT } from "@/i18n/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { User, Mail, Shield, Globe } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();
  const { t } = useT();
  return (
    <div className="space-y-8 fade-up" data-testid="settings-page">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t("settings.title")}</h1>
        <p className="mt-2 text-sm text-zinc-500">{t("settings.subtitle")}</p>
      </div>
      <div className="bg-white border border-zinc-200 rounded-xl p-6 max-w-xl space-y-4">
        <Row icon={User} label={t("common.name")} value={user?.name} />
        <Row icon={Mail} label={t("common.email")} value={user?.email} />
        <Row icon={Shield} label={t("common.role")} value={user?.role} mono />
        <div className="flex items-center gap-4 py-2">
          <Globe className="size-4 text-zinc-400" />
          <div className="flex-1">
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-mono">{t("language.label")}</div>
            <div className="mt-2"><LanguageSwitcher /></div>
          </div>
        </div>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 max-w-xl">
        <div className="font-semibold mb-1">{t("settings.mocked")}</div>
        <p className="text-amber-700/90">{t("settings.mockedDesc")}</p>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-center gap-4 py-2 border-b border-zinc-100 last:border-0">
      <Icon className="size-4 text-zinc-400" />
      <div className="flex-1">
        <div className="text-xs uppercase tracking-widest text-zinc-500 font-mono">{label}</div>
        <div className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</div>
      </div>
    </div>
  );
}
