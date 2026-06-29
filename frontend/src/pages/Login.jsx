import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, ArrowRight, AlertCircle } from "lucide-react";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("admin@wagateway.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (location.state?.error) setError(location.state.error);
  }, [location.state]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try { await login(email, password); nav("/"); }
    catch (err) { setError(formatApiError(err?.response?.data?.detail) || err.message); }
    finally { setLoading(false); }
  };

  const onGoogle = () => {
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen flex">
      {/* Left: form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm fade-up">
          <div className="flex items-center gap-2 mb-12">
            <div className="size-8 rounded-md bg-zinc-900 text-white grid place-items-center">
              <Sparkles className="size-4" strokeWidth={2} />
            </div>
            <span className="font-bold tracking-tight">WA Gateway</span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Welcome back</h1>
          <p className="mt-2 text-sm text-zinc-500">Sign in to manage your WhatsApp sessions and API keys.</p>

          <button
            type="button"
            onClick={onGoogle}
            data-testid="google-signin-button"
            className="mt-10 w-full inline-flex items-center justify-center gap-3 rounded-md border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 transition-colors active:scale-[0.99]"
          >
            <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
            </svg>
            Continue with Google
          </button>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-200" />
            <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-mono">or with email</span>
            <div className="h-px flex-1 bg-zinc-200" />
          </div>

          <form onSubmit={onSubmit} className="space-y-5" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="login-email-input" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="login-password-input" />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" data-testid="login-error">
                <AlertCircle className="size-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full" data-testid="login-submit-button">
              {loading ? "Signing in…" : "Sign in"} <ArrowRight className="ml-2 size-4" />
            </Button>
          </form>

          <p className="mt-8 text-sm text-zinc-500">
            New here? <Link to="/register" className="text-zinc-900 font-medium hover:underline" data-testid="goto-register-link">Create an account</Link>
          </p>

          <div className="mt-12 rounded-lg border border-zinc-200 bg-zinc-50 p-4 font-mono text-xs text-zinc-600">
            <div className="text-[10px] uppercase tracking-widest text-zinc-400 mb-1">Demo credentials</div>
            admin@wagateway.com / admin123
          </div>
        </div>
      </div>

      {/* Right: decorative */}
      <div className="hidden lg:block flex-1 relative overflow-hidden bg-zinc-900">
        <div className="absolute inset-0 bg-grain opacity-50" />
        <img
          src="https://images.unsplash.com/photo-1532456745301-b2c645d8b80d?crop=entropy&cs=srgb&fm=jpg&w=1600&q=85"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-30"
        />
        <div className="relative h-full flex flex-col justify-end p-12 text-white">
          <blockquote className="max-w-md">
            <p className="text-2xl font-semibold tracking-tight leading-tight">
              "The cleanest WhatsApp gateway we've shipped with. Multi-session,
              REST-ready, and beautiful to operate."
            </p>
            <footer className="mt-4 font-mono text-xs uppercase tracking-widest text-zinc-400">
              — Built for developers
            </footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}
