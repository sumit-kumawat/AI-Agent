const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateOnly = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatDateTime(timestamp: number | null | undefined) {
  return timestamp ? dateTime.format(timestamp) : "Never";
}

export function formatDate(timestamp: number | null | undefined) {
  return timestamp ? dateOnly.format(timestamp) : "Never";
}

export function formatNumber(value: number | null | undefined) {
  return (value ?? 0).toLocaleString("en-US");
}

export function formatBytes(bytes: number) {
  if (!bytes) return "";
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

/** 1234 -> "1.2K", 2500000 -> "2.5M". */
export function formatCompact(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value ?? 0);
}

export function formatAgo(timestamp: number | null | undefined, now = Date.now()) {
  if (!timestamp) return "Never";
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return formatDate(timestamp);
}
