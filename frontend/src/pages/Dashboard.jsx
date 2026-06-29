import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Smartphone, Send, CheckCircle2, AlertTriangle, TrendingUp } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

function Metric({ icon: Icon, label, value, hint, testId }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5" data-testid={testId}>
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-zinc-500 font-mono">{label}</div>
        <Icon className="size-4 text-zinc-400" strokeWidth={1.75} />
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/stats/overview").then((r) => setStats(r.data)).catch(() => {});
  }, []);

  return (
    <div className="space-y-8 fade-up" data-testid="dashboard-page">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-sm text-zinc-500">Operational overview of your WhatsApp gateway.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric icon={Smartphone} label="Active Sessions" testId="metric-active-sessions"
          value={stats ? `${stats.connected_sessions}/${stats.total_sessions}` : "—"}
          hint="connected of total" />
        <Metric icon={Send} label="Sent Today" testId="metric-sent-today"
          value={stats ? stats.today_messages : "—"} hint="outbound messages" />
        <Metric icon={CheckCircle2} label="Success Rate" testId="metric-success-rate"
          value={stats ? `${stats.success_rate}%` : "—"} hint="all-time delivery" />
        <Metric icon={AlertTriangle} label="Failed" testId="metric-failed"
          value={stats ? stats.failed_messages : "—"} hint="cumulative failures" />
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-6" data-testid="chart-7day">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-mono">Messages — last 7 days</div>
            <div className="mt-1 text-xl font-semibold tracking-tight">
              {stats ? stats.series.reduce((a, b) => a + b.count, 0) : 0} <span className="text-sm text-zinc-500 font-normal">total</span>
            </div>
          </div>
          <TrendingUp className="size-4 text-zinc-400" />
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats?.series || []} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="#f4f4f5" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#71717a", fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={{ stroke: "#e4e4e7" }} />
              <YAxis tick={{ fontSize: 11, fill: "#71717a", fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "white", border: "1px solid #e4e4e7", borderRadius: 8, fontSize: 12 }}
                cursor={{ stroke: "#a1a1aa", strokeDasharray: "3 3" }}
              />
              <Line type="monotone" dataKey="count" stroke="#18181b" strokeWidth={2} dot={{ r: 3, fill: "#18181b" }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <a href="/sessions" data-testid="quick-add-session" className="group bg-white border border-zinc-200 rounded-xl p-6 hover:border-zinc-300 transition-colors">
          <div className="text-xs uppercase tracking-widest text-zinc-500 font-mono">Quick action</div>
          <div className="mt-2 text-lg font-semibold">Add a new WhatsApp session</div>
          <div className="mt-1 text-sm text-zinc-500">Scan QR to connect another number.</div>
        </a>
        <a href="/docs" data-testid="quick-api-docs" className="group bg-zinc-900 text-white rounded-xl p-6 hover:bg-zinc-800 transition-colors">
          <div className="text-xs uppercase tracking-widest text-zinc-400 font-mono">Build it</div>
          <div className="mt-2 text-lg font-semibold">Integrate via REST API</div>
          <div className="mt-1 text-sm text-zinc-400">curl-friendly endpoints with API keys.</div>
        </a>
      </div>
    </div>
  );
}
