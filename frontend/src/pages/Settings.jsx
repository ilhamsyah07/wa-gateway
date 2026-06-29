import { useAuth } from "@/contexts/AuthContext";
import { User, Mail, Shield } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();
  return (
    <div className="space-y-8 fade-up" data-testid="settings-page">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-zinc-500">Your account details.</p>
      </div>
      <div className="bg-white border border-zinc-200 rounded-xl p-6 max-w-xl space-y-4">
        <Row icon={User} label="Name" value={user?.name} />
        <Row icon={Mail} label="Email" value={user?.email} />
        <Row icon={Shield} label="Role" value={user?.role} mono />
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 max-w-xl">
        <div className="font-semibold mb-1">Heads up — MOCKED integration</div>
        <p className="text-amber-700/90">This deployment simulates the Baileys WhatsApp connection (QR auto-connects after ~20s, send has ~92% success). To go live, swap the simulated layer in <code className="font-mono bg-amber-100 px-1 rounded">backend/server.py</code> with a real Baileys Node.js microservice.</p>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-center gap-4 py-2 border-b border-zinc-100 last:border-0">
      <Icon className="size-4 text-zinc-400" />
      <div className="flex-1">
        <div className="text-xs uppercase tracking-widest text-zinc-500 font-mono">{label}</div>
        <div className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</div>
      </div>
    </div>
  );
}
