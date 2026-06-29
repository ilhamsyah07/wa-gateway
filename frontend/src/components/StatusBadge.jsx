const variants = {
  connected: "bg-emerald-50 text-emerald-700 border-emerald-200",
  sent: "bg-emerald-50 text-emerald-700 border-emerald-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  qr: "bg-amber-50 text-amber-700 border-amber-200",
  connecting: "bg-amber-50 text-amber-700 border-amber-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  disconnected: "bg-zinc-100 text-zinc-700 border-zinc-200",
  received: "bg-blue-50 text-blue-700 border-blue-200",
};

export default function StatusBadge({ status, testId }) {
  const cls = variants[status] || variants.disconnected;
  const showDot = status === "connected" || status === "qr" || status === "connecting";
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium font-mono ${cls}`}
    >
      {showDot && <span className={`size-1.5 rounded-full bg-current pulse-dot`} />}
      {status}
    </span>
  );
}
