export function fmtMoney(n: number | string | null | undefined, symbol = "$") {
  const num = Number(n ?? 0);
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  return `${sign}${symbol}${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
