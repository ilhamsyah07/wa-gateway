import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useT } from "@/i18n/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MailPlus, Copy, Check, Trash2, Mail } from "lucide-react";
import { toast } from "sonner";

export default function Invitations() {
  const { t } = useT();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("user");
  const [link, setLink] = useState(null);
  const [copied, setCopied] = useState(null);

  const refresh = async () => {
    try { const { data } = await api.get("/admin/invitations"); setItems(data); }
    catch (err) { toast.error(formatApiError(err?.response?.data?.detail)); }
  };
  useEffect(() => { refresh(); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/admin/invitations", { email, name: name || undefined, role });
      const url = `${window.location.origin}/invite/${data.token}`;
      setLink({ ...data, url });
      setEmail(""); setName("");
      refresh();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
  };

  const copyLink = async (url, id) => {
    await navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
    toast.message(t("common.copied"));
  };

  const revoke = async (id) => {
    if (!confirm("Revoke this invitation?")) return;
    await api.delete(`/admin/invitations/${id}`);
    refresh();
  };

  return (
    <div className="space-y-6 fade-up" data-testid="invitations-section">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-zinc-500 font-mono">Invitations</div>
          <p className="mt-1 text-sm text-zinc-500">Pre-approve users — they activate via a one-time link, no admin approval needed.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setLink(null); }}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" data-testid="new-invitation-button"><MailPlus className="size-3.5 mr-1.5" /> New invitation</Button>
          </DialogTrigger>
          <DialogContent data-testid="create-invitation-dialog">
            <DialogHeader>
              <DialogTitle>{link ? "Share this link" : "Create invitation"}</DialogTitle>
              <DialogDescription>
                {link ? "Send the link to the user. It expires in 7 days." : "The invited user will set their own password and become active immediately."}
              </DialogDescription>
            </DialogHeader>
            {!link ? (
              <form onSubmit={create} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="invite-email-input" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Name (optional)</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="invite-name-input" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">user</SelectItem>
                      <SelectItem value="admin">admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit" data-testid="create-invite-submit">Create invitation</Button>
                </DialogFooter>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="bg-zinc-50 border border-zinc-200 rounded-md p-3 font-mono text-xs break-all" data-testid="new-invite-link">
                  {link.url}
                </div>
                <Button onClick={() => copyLink(link.url, "new")} className="w-full" data-testid="copy-invite-link">
                  {copied === "new" ? <><Check className="size-4 mr-2" /> Copied</> : <><Copy className="size-4 mr-2" /> Copy link</>}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <div className="bg-white border border-dashed border-zinc-300 rounded-xl p-8 text-center">
          <Mail className="size-8 mx-auto text-zinc-400" />
          <div className="mt-3 text-sm font-medium">No invitations yet</div>
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50">
              <tr className="text-left text-xs uppercase tracking-wider text-zinc-500 font-mono">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((inv) => {
                const url = `${window.location.origin}/invite/${inv.token}`;
                const statusCls = inv.status === "pending" ? "text-amber-700"
                  : inv.status === "accepted" ? "text-emerald-700" : "text-zinc-500";
                return (
                  <tr key={inv.id} className="border-t border-zinc-200 hover:bg-zinc-50/50" data-testid={`invitation-row-${inv.id}`}>
                    <td className="px-4 py-3">
                      <div className="font-mono">{inv.email}</div>
                      {inv.name && <div className="text-xs text-zinc-500">{inv.name}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{inv.role}</td>
                    <td className={`px-4 py-3 font-mono text-xs ${statusCls}`}>{inv.status}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-500">{new Date(inv.expires_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right space-x-1">
                      {inv.status === "pending" && (
                        <>
                          <button onClick={() => copyLink(url, inv.id)} className="p-1.5 rounded hover:bg-zinc-100" title="Copy link" data-testid={`copy-invite-${inv.id}`}>
                            {copied === inv.id ? <Check className="size-4 text-emerald-700" /> : <Copy className="size-4 text-zinc-500" />}
                          </button>
                          <button onClick={() => revoke(inv.id)} className="p-1.5 rounded hover:bg-zinc-100" title="Revoke" data-testid={`revoke-invite-${inv.id}`}>
                            <Trash2 className="size-4 text-red-500" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
