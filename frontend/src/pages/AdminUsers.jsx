import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useT } from "@/i18n/LanguageContext";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import Invitations from "@/components/Invitations";
import { Users, Check, X } from "lucide-react";
import { toast } from "sonner";

export default function AdminUsers() {
  const { t } = useT();
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState("pending");

  const refresh = async () => {
    try {
      const { data } = await api.get("/admin/users", { params: tab === "all" ? {} : { status: tab } });
      setUsers(data);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
  };

  useEffect(() => { refresh(); }, [tab]); // eslint-disable-line

  const approve = async (id) => {
    await api.post(`/admin/users/${id}/approve`);
    toast.success(t("admin.userApproved"));
    refresh();
  };
  const reject = async (id) => {
    if (!confirm(t("admin.rejectConfirm"))) return;
    await api.post(`/admin/users/${id}/reject`);
    toast.message(t("admin.userRejected"));
    refresh();
  };

  return (
    <div className="space-y-8 fade-up" data-testid="admin-users-page">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t("admin.title")}</h1>
        <p className="mt-2 text-sm text-zinc-500">{t("admin.subtitle")}</p>
      </div>

      <div className="flex gap-1 border-b border-zinc-200">
        {[
          { key: "pending", label: t("admin.tabPending") },
          { key: "active", label: t("admin.tabActive") },
          { key: "all", label: t("admin.tabAll") },
        ].map((tb) => (
          <button
            key={tb.key}
            data-testid={`tab-${tb.key}`}
            onClick={() => setTab(tb.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === tb.key ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {users.length === 0 ? (
        <div className="bg-white border border-dashed border-zinc-300 rounded-xl p-12 text-center">
          <Users className="size-10 mx-auto text-zinc-400" />
          <div className="mt-4 font-semibold">{t("admin.noUsers")}</div>
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50">
              <tr className="text-left text-xs uppercase tracking-wider text-zinc-500 font-mono">
                <th className="px-4 py-3">{t("admin.user")}</th>
                <th className="px-4 py-3">{t("admin.provider")}</th>
                <th className="px-4 py-3">{t("common.status")}</th>
                <th className="px-4 py-3">{t("common.created")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-zinc-200 hover:bg-zinc-50/50" data-testid={`user-row-${u.id}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {u.picture ? (
                        <img src={u.picture} alt="" className="size-8 rounded-full" />
                      ) : (
                        <div className="size-8 rounded-full bg-zinc-900 text-white text-xs grid place-items-center font-semibold">
                          {(u.name || "U").slice(0,1).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-medium">{u.name}</div>
                        <div className="text-xs font-mono text-zinc-500">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500">{u.auth_provider || "password"}</td>
                  <td className="px-4 py-3"><StatusBadge status={u.status === "active" ? "connected" : "pending"} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right space-x-1">
                    {u.status === "pending" && u.role !== "admin" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => approve(u.id)} data-testid={`approve-${u.id}`}>
                          <Check className="size-3.5 mr-1 text-emerald-600" /> {t("admin.approve")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => reject(u.id)} data-testid={`reject-${u.id}`}>
                          <X className="size-3.5 text-red-500" />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pt-8 mt-8 border-t border-zinc-200">
        <Invitations />
      </div>
    </div>
  );
}
