import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/i18n/LanguageContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import { Toaster } from "@/components/ui/sonner";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import AuthCallback from "@/pages/AuthCallback";
import AcceptInvitation from "@/pages/AcceptInvitation";
import Dashboard from "@/pages/Dashboard";
import Sessions from "@/pages/Sessions";
import SendMessage from "@/pages/SendMessage";
import Broadcast from "@/pages/Broadcast";
import AutoReply from "@/pages/AutoReply";
import History from "@/pages/History";
import ApiKeys from "@/pages/ApiKeys";
import ApiDocs from "@/pages/ApiDocs";
import Settings from "@/pages/Settings";
import AdminUsers from "@/pages/AdminUsers";

function AppRouter() {
  const location = useLocation();
  // Process OAuth callback before normal routes (handles race conditions)
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/invite/:token" element={<AcceptInvitation />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="send" element={<SendMessage />} />
        <Route path="broadcast" element={<Broadcast />} />
        <Route path="auto-reply" element={<AutoReply />} />
        <Route path="history" element={<History />} />
        <Route path="keys" element={<ApiKeys />} />
        <Route path="docs" element={<ApiDocs />} />
        <Route path="settings" element={<Settings />} />
        <Route path="admin/users" element={<AdminUsers />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </LanguageProvider>
  );
}
