import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, ArrowRight, AlertCircle } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@wagateway.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try { await login(email, password); nav("/"); }
    catch (err) { setError(formatApiError(err?.response?.data?.detail) || err.message); }
    finally { setLoading(false); }
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

          <form onSubmit={onSubmit} className="mt-10 space-y-5" data-testid="login-form">
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
