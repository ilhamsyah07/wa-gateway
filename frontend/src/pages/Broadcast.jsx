import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Megaphone, Upload } from "lucide-react";
import { toast } from "sonner";

export default function Broadcast() {
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [numbersText, setNumbersText] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get("/sessions").then((r) => {
      const c = r.data.filter((s) => s.status === "connected");
      setSessions(c); if (c[0]) setSessionId(c[0].id);
    });
  }, []);

  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text();
    setNumbersText(text);
  };

  const parseNumbers = (txt) =>
    txt.split(/[\n,;\s]+/).map((s) => s.trim()).filter(Boolean);

  const numbers = parseNumbers(numbersText);

  const onSend = async (e) => {
    e.preventDefault();
    setSending(true); setResult(null);
    try {
      const { data } = await api.post("/messages/broadcast", { session_id: sessionId, numbers, message });
      setResult(data);
      toast.success(`Broadcast complete: ${data.sent} sent, ${data.failed} failed`);
    } catch (err) { toast.error(formatApiError(err?.response?.data?.detail)); }
    finally { setSending(false); }
  };

  return (
    <div className="space-y-8 fade-up" data-testid="broadcast-page">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Broadcast</h1>
        <p className="mt-2 text-sm text-zinc-500">Send the same message to many recipients at once.</p>
      </div>

      <form onSubmit={onSend} className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">From session</Label>
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger data-testid="broadcast-session-select"><SelectValue placeholder="Select session" /></SelectTrigger>
              <SelectContent>
                {sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} <span className="font-mono text-zinc-500 ml-2">{s.phone_number}</span></SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Recipients</Label>
            <Textarea rows={6} value={numbersText} onChange={(e) => setNumbersText(e.target.value)} placeholder={"6281234567890\n6289876543210\n…"} className="font-mono text-sm" data-testid="numbers-textarea" />
            <div className="flex items-center justify-between text-xs">
              <label className="cursor-pointer inline-flex items-center gap-1.5 text-zinc-600 hover:text-zinc-900" data-testid="upload-csv-label">
                <Upload className="size-3.5" />
                <span>Upload CSV/TXT</span>
                <input type="file" accept=".csv,.txt" className="hidden" onChange={onFile} data-testid="upload-csv-input" />
              </label>
              <span className="font-mono text-zinc-500" data-testid="recipients-count">{numbers.length} recipient(s)</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Message</Label>
            <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} required data-testid="broadcast-message-input" />
          </div>

          <Button type="submit" disabled={sending || numbers.length === 0 || !sessionId} data-testid="broadcast-send-button">
            <Megaphone className="size-4 mr-2" /> {sending ? "Sending…" : `Send to ${numbers.length} recipient(s)`}
          </Button>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-6" data-testid="broadcast-results">
          <div className="text-xs uppercase tracking-widest text-zinc-500 font-mono mb-3">Result</div>
          {!result ? (
            <div className="text-sm text-zinc-500">Run a broadcast to see per-recipient results here.</div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-zinc-50 rounded-md p-3">
                  <div className="text-xs text-zinc-500 font-mono">total</div>
                  <div className="text-xl font-bold">{result.total}</div>
                </div>
                <div className="bg-emerald-50 rounded-md p-3">
                  <div className="text-xs text-emerald-700 font-mono">sent</div>
                  <div className="text-xl font-bold text-emerald-700">{result.sent}</div>
                </div>
                <div className="bg-red-50 rounded-md p-3">
                  <div className="text-xs text-red-700 font-mono">failed</div>
                  <div className="text-xl font-bold text-red-700">{result.failed}</div>
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-md border border-zinc-200">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 sticky top-0">
                    <tr className="text-left text-xs uppercase tracking-wider text-zinc-500 font-mono">
                      <th className="px-3 py-2">To</th><th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((r, i) => (
                      <tr key={i} className="border-t border-zinc-200">
                        <td className="px-3 py-2 font-mono">{r.to}</td>
                        <td className="px-3 py-2"><span className={r.status === "sent" ? "text-emerald-700" : "text-red-700"}>{r.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
