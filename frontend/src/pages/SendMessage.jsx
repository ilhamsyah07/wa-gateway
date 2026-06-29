import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useT } from "@/i18n/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Send, MessageSquareText } from "lucide-react";
import { toast } from "sonner";

export default function SendMessage() {
  const { t } = useT();
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get("/sessions").then((r) => {
      const connected = r.data.filter((s) => s.status === "connected");
      setSessions(connected);
      if (connected[0]) setSessionId(connected[0].id);
    });
  }, []);

  const onSend = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const payload = { session_id: sessionId, to, message };
      if (mediaUrl) { payload.media_url = mediaUrl; payload.media_type = mediaType || "image"; }
      const { data } = await api.post("/messages/send", payload);
      if (data.status === "sent") toast.success(t("send.sentToast"), { description: `${t("send.sentTo")} ${to}` });
      else toast.error(t("send.failedToast"));
      setMessage(""); setMediaUrl("");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    } finally { setSending(false); }
  };

  const selectedSession = sessions.find((s) => s.id === sessionId);

  return (
    <div className="space-y-8 fade-up" data-testid="send-page">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t("send.title")}</h1>
        <p className="mt-2 text-sm text-zinc-500">{t("send.subtitle")}</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <form onSubmit={onSend} className="lg:col-span-3 bg-white border border-zinc-200 rounded-xl p-6 space-y-5" data-testid="send-form">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">{t("send.fromSession")}</Label>
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger data-testid="session-select"><SelectValue placeholder={t("send.selectSession")} /></SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id} data-testid={`session-option-${s.id}`}>
                    {s.name} <span className="font-mono text-zinc-500 ml-2">{s.phone_number}</span>
                  </SelectItem>
                ))}
                {sessions.length === 0 && <div className="px-3 py-2 text-sm text-zinc-500">{t("send.noConnected")}</div>}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">{t("send.toLabel")}</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="6281234567890" required data-testid="to-input" />
            <p className="text-xs text-zinc-500">{t("send.toHint")}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-zinc-500 font-mono">{t("send.messageLabel")}</Label>
            <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("send.messagePlaceholder")} required data-testid="message-input" />
          </div>

          <details className="border border-zinc-200 rounded-md">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium select-none">{t("send.attachMedia")}</summary>
            <div className="p-3 space-y-3 border-t border-zinc-200">
              <Input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://example.com/file.jpg" data-testid="media-url-input" />
              <Select value={mediaType} onValueChange={setMediaType}>
                <SelectTrigger><SelectValue placeholder={t("send.mediaType")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">{t("send.image")}</SelectItem>
                  <SelectItem value="document">{t("send.document")}</SelectItem>
                  <SelectItem value="video">{t("send.video")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </details>

          <Button type="submit" disabled={sending || !sessionId || sessions.length === 0} data-testid="send-button">
            <Send className="size-4 mr-2" /> {sending ? t("send.sending") : t("send.sendButton")}
          </Button>
        </form>

        <div className="lg:col-span-2">
          <div className="bg-white border border-zinc-200 rounded-xl p-6" data-testid="message-preview">
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-mono mb-3">{t("send.preview")}</div>
            <div className="rounded-2xl bg-[#e7dfd5] p-4 min-h-[280px] relative" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4) 0%, transparent 50%)" }}>
              <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-3 py-2 shadow-sm">
                <div className="text-sm whitespace-pre-wrap break-words">{message || <span className="text-zinc-400">{t("send.previewPlaceholder")}</span>}</div>
                <div className="text-[10px] text-zinc-500 text-right mt-1 font-mono">
                  {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ✓✓
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
              <MessageSquareText className="size-3.5" />
              <span className="font-mono">{selectedSession?.phone_number || "—"} → {to || "—"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
