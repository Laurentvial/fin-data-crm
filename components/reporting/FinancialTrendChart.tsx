"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TrendPoint = { date: string; credits: number; debits: number };

function formatIsoToFr(iso: string): string {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const frParisHour = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatAxisLabel(dateStr: string, granularity: "day" | "hour"): string {
  if (granularity === "day") {
    const m = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}`;
    return dateStr;
  }
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return dateStr;
  return frParisHour.format(new Date(t));
}

const euroFmt = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function TooltipContent({
  active,
  payload,
  granularity,
}: {
  active?: boolean;
  payload?: Array<{ payload?: TrendPoint }>;
  granularity: "day" | "hour";
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const title =
    granularity === "hour"
      ? frParisHour.format(new Date(Date.parse(p.date)))
      : formatIsoToFr(p.date);
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium text-[var(--foreground)]">{title}</p>
      <p className="text-[var(--primary)]">Crédits : {euroFmt.format(p.credits)}</p>
      <p className="text-[var(--destructive)]">Débits : {euroFmt.format(p.debits)}</p>
    </div>
  );
}

export function FinancialTrendChart({
  points,
  granularity = "day",
}: {
  points: TrendPoint[];
  granularity?: "day" | "hour";
}) {
  if (points.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">Aucune donnée pour cette période.</p>
    );
  }

  const tickFormatter = (v: string) => formatAxisLabel(v, granularity);

  return (
    <div className="h-[320px] w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={tickFormatter}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={granularity === "hour" ? 20 : 32}
          />
          <YAxis
            tickFormatter={(v) => euroFmt.format(Number(v))}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            width={72}
          />
          <Tooltip content={(props) => <TooltipContent {...props} granularity={granularity} />} />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            formatter={(value) => <span className="text-[var(--foreground)]">{value}</span>}
          />
          <Line
            type="monotone"
            dataKey="credits"
            name="Chiffre d'affaires (crédits)"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={points.length <= 48}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="debits"
            name="Débits"
            stroke="var(--destructive)"
            strokeWidth={2}
            dot={points.length <= 48}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
