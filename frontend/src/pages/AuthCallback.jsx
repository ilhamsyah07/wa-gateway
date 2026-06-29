import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Sparkles, AlertCircle } from "lucide-react";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUserDirect } = useAuth();
  const processed = useRef(false);
  const errorRef = useRef(null);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const hash = location.hash || window.location.hash;
    const m = hash.match(/session_id=([^&]+)/);
    if (!m) { navigate("/login"); return; }
    const sessionId = decodeURIComponent(m[1]);

    (async () => {
      try {
        const { data } = await api.post("/auth/google/session", { session_id: sessionId });
        localStorage.setItem("wag_token", data.access_token);
        localStorage.setItem("wag_user", JSON.stringify(data.user));
        setUserDirect(data.user);
        // clear hash
        window.history.replaceState(null, "", "/");
        navigate("/", { replace: true });
      } catch (err) {
        const msg = formatApiError(err?.response?.data?.detail) || err.message;
        errorRef.current = msg;
        // Force re-render via a state hack: redirect to /login with message
        navigate("/login", { replace: true, state: { error: msg } });
      }
    })();
  }, [location.hash, navigate, setUserDirect]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="text-center fade-up">
        <div className="size-10 mx-auto rounded-md bg-zinc-900 text-white grid place-items-center">
          <Sparkles className="size-5" />
        </div>
        <div className="mt-4 font-mono text-xs text-zinc-500 uppercase tracking-widest">Completing sign-in…</div>
        {errorRef.current && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="size-4" /> {errorRef.current}
          </div>
        )}
      </div>
    </div>
  );
}
