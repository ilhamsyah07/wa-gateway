import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useT } from "@/i18n/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { KeyRound, Plus, Copy, Trash2, Check } from "lucide-react";
import { toast } from "sonner";

export default function ApiKeys() {
  const { t } = useT();
  const [keys, setKeys] = useState([]);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [newKey, setNewKey] = useState(null);
  const [copied, setCopied] = useState(null);

  const refresh = async () => {
    const { data } = await api.get("/api-keys");
    setKeys(data);
  };
  useEffect(() => { refresh(); }, []);

  const create = async (e) => {
    e.preventDefault();
    const { data } = await api.post("/api-keys", { label });
    setNewKey(data);
    setLabel("");
    refresh();
  };

  const copy = async (k, id) => {
    await navigator.clipboard.writeText(k);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
    toast.message(t("common.copied"));
  };

  const revoke = async (id) => {
    if (!confirm(t("apiKeys.revokeConfirm"))) return;
    await api.delete(`/api-keys/${id}`); refresh();
  };

  return (
    <div className="space-y-8 fade-up" data-testid="api-keys-page">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t("apiKeys.title")}</h1>
          <p className="mt-2 text-sm text-zinc-500">{t("apiKeys.subtitle")}</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setNewKey(null); }}>
          <DialogTrigger asChild>
            <Button data-testid="add-api-key-button"><Plus className="size-4 mr-2" /> {t("apiKeys.generate")}</Button>
          </DialogTrigger>
          <DialogContent data-testid="create-api-key-dialog">
            <DialogHeader>
              <DialogTitle>{newKey ? t("apiKeys.saveTitle") : t("apiKeys.createTitle")}</DialogTitle>
              <DialogDescription>
                {newKey ? t("apiKeys.saveDesc") : t("apiKeys.createDesc")}
              </DialogDescription>
            </DialogHeader>
            {!newKey ? (
              <form onSubmit={create} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">{t("apiKeys.label")}</Label>
                  <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("apiKeys.labelPlaceholder")} required data-testid="api-key-label-input" />
                </div>
                <DialogFooter>
                  <Button type="submit" data-testid="api-key-create-submit">{t("apiKeys.generate")}</Button>
                </DialogFooter>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="bg-zinc-900 text-emerald-300 rounded-md p-3 font-mono text-xs break-all" data-testid="new-api-key-value">
                  {newKey.key}
                </div>
                <Button onClick={() => copy(newKey.key, "new")} className="w-full" data-testid="copy-new-key-button">
                  {copied === "new" ? <><Check className="size-4 mr-2" /> {t("common.copied")}</> : <><Copy className="size-4 mr-2" /> {t("apiKeys.copyKey")}</>}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {keys.length === 0 ? (
        <div className="bg-white border border-dashed border-zinc-300 rounded-xl p-12 text-center">
          <KeyRound className="size-10 mx-auto text-zinc-400" />
          <div className="mt-4 font-semibold">{t("apiKeys.noKeys")}</div>
          <div className="mt-1 text-sm text-zinc-500">{t("apiKeys.noKeysSub")}</div>
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50">
              <tr className="text-left text-xs uppercase tracking-wider text-zinc-500 font-mono">
                <th className="px-4 py-3">{t("apiKeys.label")}</th>
                <th className="px-4 py-3">{t("apiKeys.keyCol")}</th>
                <th className="px-4 py-3">{t("common.created")}</th>
                <th className="px-4 py-3">{t("apiKeys.lastUsed")}</th>
                <th className="px-4 py-3">{t("common.status")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-t border-zinc-200 hover:bg-zinc-50/50" data-testid={`api-key-row-${k.id}`}>
                  <td className="px-4 py-3 font-medium">{k.label}</td>
                  <td className="px-4 py-3 font-mono text-zinc-600">{k.key_masked}</td>
                  <td className="px-4 py-3 font-mono text-zinc-500 text-xs">{new Date(k.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-mono text-zinc-500 text-xs">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "—"}</td>
                  <td className="px-4 py-3">
                    {k.revoked
                      ? <span className="text-xs font-mono text-red-700">{t("apiKeys.revoked")}</span>
                      : <span className="text-xs font-mono text-emerald-700">{t("apiKeys.active")}</span>}
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <button onClick={() => copy(k.key, k.id)} className="p-1.5 rounded hover:bg-zinc-100" title={t("common.copy")} data-testid={`copy-key-${k.id}`}>
                      {copied === k.id ? <Check className="size-4 text-emerald-700" /> : <Copy className="size-4 text-zinc-500" />}
                    </button>
                    {!k.revoked && (
                      <button onClick={() => revoke(k.id)} className="p-1.5 rounded hover:bg-zinc-100" title={t("common.delete")} data-testid={`revoke-key-${k.id}`}>
                        <Trash2 className="size-4 text-red-500" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
