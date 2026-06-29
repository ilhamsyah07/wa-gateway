import { createContext, useContext, useState, useCallback, useMemo } from "react";
import { dictionaries, getNested } from "@/i18n/translations";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const initial = (() => {
    const saved = localStorage.getItem("wag_lang");
    if (saved === "en" || saved === "id") return saved;
    // default to Indonesian (user explicitly asked for ID)
    return "id";
  })();
  const [lang, setLangState] = useState(initial);

  const setLang = useCallback((next) => {
    if (next !== "en" && next !== "id") return;
    localStorage.setItem("wag_lang", next);
    setLangState(next);
  }, []);

  const t = useCallback(
    (key, fallback) => {
      const v = getNested(dictionaries[lang], key);
      if (v !== undefined) return v;
      const en = getNested(dictionaries.en, key);
      return en !== undefined ? en : (fallback ?? key);
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useT must be used inside LanguageProvider");
  return ctx;
}
