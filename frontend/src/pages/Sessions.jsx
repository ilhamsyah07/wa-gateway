import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
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
  const [sessions, setSessions] = useState([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [openQr, setOpenQr] = useState(null); // session object
  const [name, setName] = useState("");
  const [phoneLabel, setPhoneLabel] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    const { data } = await api.get("/sessions");
    setSessions(data);
  };

  useEffect(() => { refresh(); }, []);

  // poll while waiting for QR scan
  useEffect(() => {
    if (!openQr) return;
    const t = setInterval(async () => {
      try {
        const { data } = await api.get(`/sessions/${openQr.id}`);
        setOpenQr(data);
        if (data.status === "connected") {
          await refresh();
          toast.success("Session connected", { description: `${data.name} is now online` });
        }
      } catch {}
    }, 2500);
    return () => clearInterval(t);
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
    const { data } = await api.post(`/sessions/${id}/regenerate-qr`);
    const fresh = (await api.get(`/sessions/${id}`)).data;
    setOpenQr(fresh);
    await refresh();
    toast.message("QR refreshed");
  };

  const disconnect = async (id) => {
    await api.post(`/sessions/${id}/disconnect`);
    await refresh();
    toast.message("Session disconnected");
  };

  const remove = async (id) => {
    if (!confirm("Delete this session?")) return;
    await api.delete(`/sessions/${id}`);
    await refresh();
    toast.message("Session deleted");
  };

  return (
    <div className="space-y-8 fade-up" data-testid="sessions-page">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Sessions</h1>
          <p className="mt-2 text-sm text-zinc-500">Connect multiple WhatsApp numbers. Each session represents one logged-in phone.</p>
        </div>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button data-testid="add-session-button"><Plus className="size-4 mr-2" /> New session</Button>
          </DialogTrigger>
          <DialogContent data-testid="create-session-dialog">
            <DialogHeader>
              <DialogTitle>Create a new session</DialogTitle>
              <DialogDescription>You'll scan a QR code on the next step to link a WhatsApp account.</DialogDescription>
            </DialogHeader>
            <form onSubmit={createSession} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Session name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sales Bot" required data-testid="session-name-input" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Phone label (optional)</Label>
                <Input value={phoneLabel} onChange={(e) => setPhoneLabel(e.target.value)} placeholder="e.g. CS Team" data-testid="session-label-input" />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={creating} data-testid="create-session-submit">
                  {creating ? "Creating…" : "Create & show QR"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Sessions list */}
      {sessions.length === 0 ? (
        <div className="bg-white border border-dashed border-zinc-300 rounded-xl p-12 text-center">
          <Smartphone className="size-10 mx-auto text-zinc-400" strokeWidth={1.5} />
          <div className="mt-4 font-semibold">No sessions yet</div>
          <div className="mt-1 text-sm text-zinc-500">Create your first session to start sending messages.</div>
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
                    <RefreshCw className="size-3.5 mr-1.5" /> Scan QR
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => disconnect(s.id)} data-testid={`disconnect-${s.id}`}>
                    <Power className="size-3.5 mr-1.5" /> Disconnect
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

      {/* QR Dialog */}
      <Dialog open={!!openQr} onOpenChange={(o) => !o && setOpenQr(null)}>
        <DialogContent data-testid="qr-dialog">
          <DialogHeader>
            <DialogTitle>Scan with WhatsApp</DialogTitle>
            <DialogDescription>
              Open WhatsApp → Settings → Linked devices → Link a device, then scan this QR.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center p-4 border-2 border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50">
            {openQr?.status === "connected" ? (
              <div className="py-10 text-center">
                <div className="size-12 mx-auto rounded-full bg-emerald-100 text-emerald-700 grid place-items-center">✓</div>
                <div className="mt-3 font-semibold">Connected</div>
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
                  <RefreshCw className="size-3.5 mr-1.5" /> Refresh
                </Button>
              )}
            </div>
            <p className="mt-4 text-[11px] font-mono text-zinc-500 text-center max-w-xs">
              MOCKED: this QR auto-connects ~20s after creation to simulate a real scan.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
