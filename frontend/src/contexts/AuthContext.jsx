import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined=loading, null=guest, object=user

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("wag_token");
    if (!token) { setUser(null); return; }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      localStorage.setItem("wag_user", JSON.stringify(data));
    } catch {
      localStorage.removeItem("wag_token");
      localStorage.removeItem("wag_user");
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // CRITICAL: If returning from OAuth callback, skip the /me check.
    // AuthCallback will exchange the session_id and establish the session first.
    if (window.location.hash?.includes("session_id=")) { setUser(null); return; }
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("wag_token", data.access_token);
    localStorage.setItem("wag_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const register = async (name, email, password) => {
    const { data } = await api.post("/auth/register", { name, email, password });
    localStorage.setItem("wag_token", data.access_token);
    localStorage.setItem("wag_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("wag_token");
    localStorage.removeItem("wag_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, refresh, setUserDirect: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
