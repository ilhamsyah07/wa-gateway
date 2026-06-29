import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useT } from "@/i18n/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, ArrowRight, AlertCircle } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const { t } = useT();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try { await register(name, email, password); nav("/"); }
    catch (err) { setError(formatApiError(err?.response?.data?.detail) || err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex relative">
      <div className="absolute top-4 right-4 z-10"><LanguageSwitcher /></div>
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm fade-up">
          <div className="flex items-center gap-2 mb-12">
            <div className="size-8 rounded-md bg-zinc-900 text-white grid place-items-center">
              <Sparkles className="size-4" />
            </div>
            <span className="font-bold tracking-tight">WA Gateway</span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight">{t("auth.createYourAccount")}</h1>
          <p className="mt-2 text-sm text-zinc-500">{t("auth.startSendingMessages")}</p>

          <form onSubmit={onSubmit} className="mt-10 space-y-5" data-testid="register-form">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">{t("common.name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required data-testid="register-name-input" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">{t("common.email")}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="register-email-input" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">{t("auth.password")}</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} data-testid="register-password-input" />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" data-testid="register-error">
                <AlertCircle className="size-4 mt-0.5" /><span>{error}</span>
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full" data-testid="register-submit-button">
              {loading ? t("auth.creating") : t("auth.createAccount")} <ArrowRight className="ml-2 size-4" />
            </Button>
          </form>

          <p className="mt-8 text-sm text-zinc-500">
            {t("auth.alreadyHaveAccount")} <Link to="/login" className="text-zinc-900 font-medium hover:underline" data-testid="goto-login-link">{t("auth.signIn")}</Link>
          </p>
        </div>
      </div>

      <div className="hidden lg:block flex-1 relative overflow-hidden bg-zinc-900">
        <div className="absolute inset-0 bg-grain opacity-50" />
        <img
          src="https://images.unsplash.com/photo-1532456745301-b2c645d8b80d?crop=entropy&cs=srgb&fm=jpg&w=1600&q=85"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-30"
        />
      </div>
    </div>
  );
}
