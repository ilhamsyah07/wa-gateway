import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useT } from "@/i18n/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import StatusBadge from "@/components/StatusBadge";
import { Plus, RefreshCw, Trash2, Power, Smartphone } from "lucide-react";
import { toast } from "sonner";

export default function Sessions() {
  const { t } = useT();
  const [sessions, setSessions] = useState([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [openQr, setOpenQr] = useState(null);
  const [name, setName] = useState("");
  const [phoneLabel, setPhoneLabel] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    const { data } = await api.get("/sessions");
    setSessions(data);
  };

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!openQr) return;
    const tm = setInterval(async () => {
      try {
        const { data } = await api.get(`/sessions/${openQr.id}`);
        setOpenQr(data);
        if (data.status === "connected") {
          await refresh();
          toast.success(t("sessions.sessionConnected"), { description: `${data.name} ${t("sessions.isNowOnline")}` });
        }
      } catch {}
    }, 2500);
    return () => clearInterval(tm);
  }, [openQr?.id]); // eslint-disable-line

  const createSession = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data } = await api.post("/sessions", { name, phone_label: phoneLabel || null });
      setOpenCreate(false);
      setName(""); setPhoneLabel("");
      setOpenQr(data);
      await refresh();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    } finally { setCreating(false); }
  };

  const regenerate = async (id) => {
    await api.post(`/sessions/${id}/regenerate-qr`);
    const fresh = (await api.get(`/sessions/${id}`)).data;
    setOpenQr(fresh);
    await refresh();
    toast.message(t("sessions.qrRefreshed"));
  };

  const disconnect = async (id) => {
    await api.post(`/sessions/${id}/disconnect`);
    await refresh();
    toast.message(t("sessions.sessionDisconnected"));
  };

  const remove = async (id) => {
    if (!confirm(t("sessions.deleteConfirm"))) return;
    await api.delete(`/sessions/${id}`);
    await refresh();
    toast.message(t("sessions.sessionDeleted"));
  };

  return (
    <div className="space-y-8 fade-up" data-testid="sessions-page">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t("sessions.title")}</h1>
          <p className="mt-2 text-sm text-zinc-500">{t("sessions.subtitle")}</p>
        </div>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button data-testid="add-session-button"><Plus className="size-4 mr-2" /> {t("sessions.newSession")}</Button>
          </DialogTrigger>
          <DialogContent data-testid="create-session-dialog">
            <DialogHeader>
              <DialogTitle>{t("sessions.createTitle")}</DialogTitle>
              <DialogDescription>{t("sessions.createDesc")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={createSession} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">{t("sessions.nameLabel")}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("sessions.namePlaceholder")} required data-testid="session-name-input" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">{t("sessions.phoneLabel")}</Label>
                <Input value={phoneLabel} onChange={(e) => setPhoneLabel(e.target.value)} placeholder={t("sessions.phonePlaceholder")} data-testid="session-label-input" />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={creating} data-testid="create-session-submit">
                  {creating ? t("auth.creating") : t("sessions.createAndQr")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-white border border-dashed border-zinc-300 rounded-xl p-12 text-center">
          <Smartphone className="size-10 mx-auto text-zinc-400" strokeWidth={1.5} />
          <div className="mt-4 font-semibold">{t("sessions.noSessions")}</div>
          <div className="mt-1 text-sm text-zinc-500">{t("sessions.noSessionsSub")}</div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((s) => (
            <div key={s.id} className="bg-white border border-zinc-200 rounded-xl p-5" data-testid={`session-card-${s.id}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold tracking-tight">{s.name}</div>
                  {s.phone_label && <div className="text-xs text-zinc-500">{s.phone_label}</div>}
                </div>
                <StatusBadge status={s.status} testId={`session-status-${s.id}`} />
              </div>
              <div className="mt-4 space-y-1.5 text-xs font-mono text-zinc-600">
                <div className="flex justify-between"><span className="text-zinc-400">phone</span><span>{s.phone_number || "—"}</span></div>
                <div className="flex justify-between"><span className="text-zinc-400">id</span><span className="truncate ml-2">{s.id.slice(0,8)}…</span></div>
              </div>
              <div className="mt-5 flex gap-2">
                {s.status !== "connected" ? (
                  <Button variant="outline" size="sm" onClick={() => setOpenQr(s)} data-testid={`scan-qr-${s.id}`}>
                    <RefreshCw className="size-3.5 mr-1.5" /> {t("sessions.scanQr")}
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => disconnect(s.id)} data-testid={`disconnect-${s.id}`}>
                    <Power className="size-3.5 mr-1.5" /> {t("sessions.disconnect")}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => remove(s.id)} data-testid={`delete-session-${s.id}`}>
                  <Trash2 className="size-3.5 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!openQr} onOpenChange={(o) => !o && setOpenQr(null)}>
        <DialogContent data-testid="qr-dialog">
          <DialogHeader>
            <DialogTitle>{t("sessions.scanWithWA")}</DialogTitle>
            <DialogDescription>{t("sessions.scanInstructions")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center p-4 border-2 border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50">
            {openQr?.status === "connected" ? (
              <div className="py-10 text-center">
                <div className="size-12 mx-auto rounded-full bg-emerald-100 text-emerald-700 grid place-items-center">✓</div>
                <div className="mt-3 font-semibold">{t("sessions.connected")}</div>
                <div className="font-mono text-xs text-zinc-500 mt-1">{openQr.phone_number}</div>
              </div>
            ) : openQr?.qr_data_url ? (
              <img src={openQr.qr_data_url} alt="QR code" className="size-64" data-testid="qr-code-canvas" />
            ) : (
              <div className="size-64 bg-zinc-100 animate-pulse rounded-lg" />
            )}
            <div className="mt-4 flex items-center gap-2">
              <StatusBadge status={openQr?.status || "qr"} />
              {openQr?.status !== "connected" && (
                <Button variant="outline" size="sm" onClick={() => regenerate(openQr.id)} data-testid="regenerate-qr-button">
                  <RefreshCw className="size-3.5 mr-1.5" /> {t("common.refresh")}
                </Button>
              )}
            </div>
            <p className="mt-4 text-[11px] font-mono text-zinc-500 text-center max-w-xs">
              {t("sessions.mockedNote")}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
