import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (user === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <div className="font-mono text-xs text-zinc-500">loading…</div>
      </div>
    );
  }
  if (user === null) return <Navigate to="/login" replace />;
  return children;
}
