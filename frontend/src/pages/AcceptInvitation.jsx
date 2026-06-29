import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useT } from "@/i18n/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";

export default function AcceptInvitation() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { t } = useT();
  const { setUserDirect } = useAuth();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    api.get(`/invitations/${token}`)
      .then((r) => { setInvite(r.data); setName(r.data.name || ""); })
      .catch((err) => setError(formatApiError(err?.response?.data?.detail) || "Invitation invalid"))
      .finally(() => setLoading(false));
  }, [token]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true); setError("");
    try {
      const { data } = await api.post(`/invitations/${token}/accept`, { name, password });
      localStorage.setItem("wag_token", data.access_token);
      localStorage.setItem("wag_user", JSON.stringify(data.user));
      setUserDirect(data.user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(formatApiError(err?.response?.data?.detail) || err.message);
    } finally { setSubmitting(false); }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><div className="font-mono text-xs text-zinc-500">{t("common.loading")}</div></div>;
  }

  return (
    <div className="min-h-screen flex relative bg-white">
      <div className="absolute top-4 right-4 z-10"><LanguageSwitcher /></div>
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm fade-up" data-testid="accept-invitation-page">
          <div className="flex items-center gap-2 mb-12">
            <div className="size-8 rounded-md bg-zinc-900 text-white grid place-items-center">
              <Sparkles className="size-4" />
            </div>
            <span className="font-bold tracking-tight">WA Gateway</span>
          </div>

          {!invite ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold mb-1">Invitation invalid</div>
                <div>{error}</div>
              </div>
            </div>
          ) : (
            <>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium font-mono text-emerald-700 mb-4">
                <CheckCircle2 className="size-3" /> invitation valid
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Accept invitation</h1>
              <p className="mt-2 text-sm text-zinc-500">
                You've been invited to join as <span className="font-mono text-zinc-700">{invite.email}</span>.
                Set your password to activate the account.
              </p>

              <form onSubmit={onSubmit} className="mt-8 space-y-5" data-testid="accept-invite-form">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">{t("common.name")}</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required data-testid="invite-name-input" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">{t("auth.password")}</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} data-testid="invite-password-input" />
                </div>
                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
                    <AlertCircle className="size-4 mt-0.5" /><span>{error}</span>
                  </div>
                )}
                <Button type="submit" disabled={submitting} className="w-full" data-testid="invite-accept-button">
                  {submitting ? t("auth.creating") : "Accept & sign in"} <ArrowRight className="ml-2 size-4" />
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
