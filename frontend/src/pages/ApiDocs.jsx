import { useState } from "react";
import { useT } from "@/i18n/LanguageContext";
import { Copy, Check } from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL + "/api";

function CodeBlock({ code, id, lang = "bash" }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative rounded-lg bg-zinc-900 text-zinc-100 font-mono text-xs overflow-x-auto" data-testid={id}>
      <button onClick={copy} className="absolute top-2 right-2 p-1.5 rounded bg-zinc-800 hover:bg-zinc-700" data-testid={`${id}-copy`}>
        {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
      </button>
      <div className="px-4 py-1 border-b border-zinc-800 text-[10px] uppercase tracking-widest text-zinc-500">{lang}</div>
      <pre className="p-4 whitespace-pre-wrap">{code}</pre>
    </div>
  );
}

function Endpoint({ method, path, desc, color = "bg-emerald-600" }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-zinc-200 last:border-0">
      <span className={`shrink-0 ${color} text-white text-[10px] font-bold uppercase rounded px-2 py-0.5 font-mono`}>{method}</span>
      <div>
        <div className="font-mono text-sm">{path}</div>
        <div className="text-xs text-zinc-500 mt-0.5">{desc}</div>
      </div>
    </div>
  );
}

export default function ApiDocs() {
  const { t } = useT();
  const curlSend = `curl -X POST ${API_URL}/v1/send \\
  -H "X-API-Key: wag_YOUR_KEY_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "session_id": "your-session-id",
    "to": "6281234567890",
    "message": "Hello from WA Gateway!"
  }'`;

  const curlSessions = `curl ${API_URL}/v1/sessions \\
  -H "X-API-Key: wag_YOUR_KEY_HERE"`;

  const jsExample = `import axios from "axios";

await axios.post("${API_URL}/v1/send", {
  session_id: "your-session-id",
  to: "6281234567890",
  message: "Hello!",
}, {
  headers: { "X-API-Key": process.env.WA_GATEWAY_KEY }
});`;

  return (
    <div className="space-y-8 fade-up" data-testid="api-docs-page">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t("apiDocs.title")}</h1>
        <p className="mt-2 text-sm text-zinc-500">{t("apiDocs.subtitle")}</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-white border border-zinc-200 rounded-xl p-6">
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-mono mb-2">{t("apiDocs.baseUrl")}</div>
            <div className="font-mono text-sm bg-zinc-50 border border-zinc-200 rounded px-3 py-2 break-all">{API_URL}</div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-6">
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-mono mb-2">{t("apiDocs.auth")}</div>
            <p className="text-sm text-zinc-600">{t("apiDocs.authDesc")} <a href="/keys" className="text-zinc-900 underline">API Keys</a>.</p>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-6">
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-mono mb-3">{t("apiDocs.endpoints")}</div>
            <Endpoint method="POST" path="/v1/send" desc={t("apiDocs.endpointSendDesc")} />
            <Endpoint method="GET" path="/v1/sessions" desc={t("apiDocs.endpointSessionsDesc")} color="bg-blue-600" />
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-mono mb-2">{t("apiDocs.sendCurl")}</div>
            <CodeBlock code={curlSend} id="curl-send-example" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-mono mb-2">{t("apiDocs.sessionsCurl")}</div>
            <CodeBlock code={curlSessions} id="curl-sessions-example" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-mono mb-2">{t("apiDocs.jsExample")}</div>
            <CodeBlock code={jsExample} id="js-example" lang="javascript" />
          </div>
        </div>
      </div>
    </div>
  );
}
