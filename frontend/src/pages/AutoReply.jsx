import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Bot, Plus, Trash2, Play } from "lucide-react";
import { toast } from "sonner";

export default function AutoReply() {
  const [sessions, setSessions] = useState([]);
  const [rules, setRules] = useState([]);
  const [open, setOpen] = useState(false);
  const [openSim, setOpenSim] = useState(false);

  const blank = { session_id: "", keyword: "", match_type: "contains", reply: "", active: true };
  const [draft, setDraft] = useState(blank);

  const refresh = async () => {
    const [s, r] = await Promise.all([api.get("/sessions"), api.get("/auto-replies")]);
    setSessions(s.data); setRules(r.data);
  };
  useEffect(() => { refresh(); }, []);

  const create = async (e) => {
    e.preventDefault();
    const payload = { ...draft, session_id: draft.session_id || null };
    await api.post("/auto-replies", payload);
    setOpen(false); setDraft(blank); refresh();
    toast.success("Rule created");
  };

  const toggle = async (rule) => {
    await api.patch(`/auto-replies/${rule.id}`, { ...rule, active: !rule.active });
    refresh();
  };
  const remove = async (id) => {
    if (!confirm("Delete rule?")) return;
    await api.delete(`/auto-replies/${id}`);
    refresh();
  };

  // Simulator
  const [simSession, setSimSession] = useState("");
  const [simText, setSimText] = useState("");
  const [simResult, setSimResult] = useState(null);
  const runSim = async (e) => {
    e.preventDefault();
    const { data } = await api.post("/auto-replies/simulate", { session_id: simSession, text: simText });
    setSimResult(data);
  };

  return (
    <div className="space-y-8 fade-up" data-testid="auto-reply-page">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Auto-Reply</h1>
          <p className="mt-2 text-sm text-zinc-500">Trigger automatic replies when incoming messages match keywords.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={openSim} onOpenChange={setOpenSim}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="simulate-button"><Play className="size-4 mr-2" /> Simulate</Button>
            </DialogTrigger>
            <DialogContent data-testid="simulate-dialog">
              <DialogHeader>
                <DialogTitle>Simulate an incoming message</DialogTitle>
                <DialogDescription>Triggers rule matching as if a message arrived on your session.</DialogDescription>
              </DialogHeader>
              <form onSubmit={runSim} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Session</Label>
                  <Select value={simSession} onValueChange={setSimSession}>
                    <SelectTrigger data-testid="sim-session-select"><SelectValue placeholder="Pick a connected session" /></SelectTrigger>
                    <SelectContent>
                      {sessions.filter((s) => s.status === "connected").map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Incoming text</Label>
                  <Textarea rows={3} value={simText} onChange={(e) => setSimText(e.target.value)} required data-testid="sim-text-input" />
                </div>
                <DialogFooter>
                  <Button type="submit" data-testid="run-simulate-button">Run</Button>
                </DialogFooter>
              </form>
              {simResult && (
                <div className="rounded-md border border-zinc-200 p-3 text-xs font-mono space-y-1" data-testid="sim-result">
                  <div>matched: <span className="font-semibold">{simResult.matched_rule?.keyword || "no match"}</span></div>
                  <div>reply sent: <span className="font-semibold">{simResult.reply ? "yes" : "no"}</span></div>
                  {simResult.reply && <div className="text-zinc-600">"{simResult.reply.message}"</div>}
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-rule-button"><Plus className="size-4 mr-2" /> New rule</Button>
            </DialogTrigger>
            <DialogContent data-testid="create-rule-dialog">
              <DialogHeader>
                <DialogTitle>New auto-reply rule</DialogTitle>
                <DialogDescription>When incoming message matches the keyword, send the reply.</DialogDescription>
              </DialogHeader>
              <form onSubmit={create} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Session (optional)</Label>
                  <Select value={draft.session_id || "__all__"} onValueChange={(v) => setDraft({ ...draft, session_id: v === "__all__" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="All sessions" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All sessions</SelectItem>
                      {sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2 col-span-1">
                    <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Match type</Label>
                    <Select value={draft.match_type} onValueChange={(v) => setDraft({ ...draft, match_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contains">contains</SelectItem>
                        <SelectItem value="exact">exact</SelectItem>
                        <SelectItem value="starts_with">starts with</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 col-span-1">
                    <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Keyword</Label>
                    <Input value={draft.keyword} onChange={(e) => setDraft({ ...draft, keyword: e.target.value })} required data-testid="rule-keyword-input" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Reply</Label>
                  <Textarea rows={3} value={draft.reply} onChange={(e) => setDraft({ ...draft, reply: e.target.value })} required data-testid="rule-reply-input" />
                </div>
                <DialogFooter>
                  <Button type="submit" data-testid="create-rule-submit">Create rule</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="bg-white border border-dashed border-zinc-300 rounded-xl p-12 text-center">
          <Bot className="size-10 mx-auto text-zinc-400" />
          <div className="mt-4 font-semibold">No auto-reply rules</div>
          <div className="mt-1 text-sm text-zinc-500">Create your first rule to start responding automatically.</div>
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50">
              <tr className="text-left text-xs uppercase tracking-wider text-zinc-500 font-mono">
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Keyword</th>
                <th className="px-4 py-3">Match</th>
                <th className="px-4 py-3">Reply</th>
                <th className="px-4 py-3">Session</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => {
                const sess = sessions.find((s) => s.id === r.session_id);
                return (
                  <tr key={r.id} className="border-t border-zinc-200 hover:bg-zinc-50/50" data-testid={`rule-row-${r.id}`}>
                    <td className="px-4 py-3"><Switch checked={r.active} onCheckedChange={() => toggle(r)} data-testid={`rule-toggle-${r.id}`} /></td>
                    <td className="px-4 py-3 font-mono">{r.keyword}</td>
                    <td className="px-4 py-3 text-zinc-500 font-mono">{r.match_type}</td>
                    <td className="px-4 py-3 max-w-xs truncate">{r.reply}</td>
                    <td className="px-4 py-3 text-zinc-500">{sess ? sess.name : <span className="italic">all</span>}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => remove(r.id)} className="text-red-500 hover:text-red-700" data-testid={`rule-delete-${r.id}`}>
                        <Trash2 className="size-4" />
                      </button>
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
