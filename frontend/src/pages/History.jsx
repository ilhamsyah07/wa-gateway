import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useT } from "@/i18n/LanguageContext";
import StatusBadge from "@/components/StatusBadge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function History() {
  const { t } = useT();
  const [data, setData] = useState({ items: [], total: 0 });
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const limit = 25;

  const load = async () => {
    const params = { limit, skip: page * limit };
    if (statusFilter !== "all") params.status = statusFilter;
    const { data } = await api.get("/messages", { params });
    setData(data);
  };

  useEffect(() => { load(); }, [statusFilter, page]); // eslint-disable-line

  const totalPages = Math.max(1, Math.ceil(data.total / limit));

  return (
    <div className="space-y-8 fade-up" data-testid="history-page">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t("history.title")}</h1>
          <p className="mt-2 text-sm text-zinc-500">{t("history.subtitle")}</p>
        </div>
        <div className="w-48">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger data-testid="status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("history.allStatuses")}</SelectItem>
              <SelectItem value="sent">{t("history.sent")}</SelectItem>
              <SelectItem value="failed">{t("history.failed")}</SelectItem>
              <SelectItem value="received">{t("history.received")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50">
            <tr className="text-left text-xs uppercase tracking-wider text-zinc-500 font-mono">
              <th className="px-4 py-3">{t("history.time")}</th>
              <th className="px-4 py-3">{t("history.direction")}</th>
              <th className="px-4 py-3">{t("history.counterparty")}</th>
              <th className="px-4 py-3">{t("history.message")}</th>
              <th className="px-4 py-3">{t("history.source")}</th>
              <th className="px-4 py-3">{t("history.statusCol")}</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-zinc-500 text-sm">{t("history.noMessages")}</td></tr>
            )}
            {data.items.map((m) => (
              <tr key={m.id} className="border-t border-zinc-200 hover:bg-zinc-50/50" data-testid={`message-row-${m.id}`}>
                <td className="px-4 py-3 font-mono text-zinc-600 whitespace-nowrap">{new Date(m.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-xs font-mono uppercase">{m.direction === "outbound" ? t("history.out") : t("history.in")}</td>
                <td className="px-4 py-3 font-mono">{m.direction === "outbound" ? m.to : m.from}</td>
                <td className="px-4 py-3 max-w-xs truncate text-zinc-700">{m.message}</td>
                <td className="px-4 py-3 text-xs font-mono text-zinc-500">{m.source}</td>
                <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span className="font-mono text-xs">{t("common.page")} {page + 1} / {totalPages} · {data.total} {t("common.total")}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} data-testid="prev-page"><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} data-testid="next-page"><ChevronRight className="size-4" /></Button>
        </div>
      </div>
    </div>
  );
}
