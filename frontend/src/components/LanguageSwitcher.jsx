import { useT } from "@/i18n/LanguageContext";
import { Globe } from "lucide-react";

export default function LanguageSwitcher({ compact = false }) {
  const { lang, setLang } = useT();
  const next = lang === "id" ? "en" : "id";

  if (compact) {
    return (
      <button
        data-testid="language-switcher"
        onClick={() => setLang(next)}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-mono uppercase tracking-widest text-zinc-600 hover:bg-zinc-50 transition-colors"
        title={lang === "id" ? "Switch to English" : "Ubah ke Bahasa Indonesia"}
      >
        <Globe className="size-3" strokeWidth={1.75} />
        {lang === "id" ? "ID" : "EN"}
      </button>
    );
  }

  return (
    <div className="inline-flex rounded-md border border-zinc-200 bg-white p-0.5" data-testid="language-toggle">
      <button
        onClick={() => setLang("id")}
        data-testid="lang-id"
        className={`px-3 py-1 text-xs font-medium rounded ${lang === "id" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"}`}
      >
        ID
      </button>
      <button
        onClick={() => setLang("en")}
        data-testid="lang-en"
        className={`px-3 py-1 text-xs font-medium rounded ${lang === "en" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"}`}
      >
        EN
      </button>
    </div>
  );
}
