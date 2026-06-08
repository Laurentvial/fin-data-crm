"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type CategoryBreakdownPoint = {
  category: string;
  amount: number;
  count?: number;
};

const euroFmt = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function TooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: CategoryBreakdownPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium text-[var(--foreground)]">{p.category}</p>
      <p className="text-[var(--foreground)]">Montant : {euroFmt.format(p.amount)}</p>
      {typeof p.count === "number" ? (
        <p className="text-[var(--muted-foreground)]">
          {p.count} opération{p.count === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}

export function CategoryBreakdownChart({
  points,
  color,
}: {
  points: CategoryBreakdownPoint[];
  color: string;
}) {
  if (points.length === 0) {
    return <p className="text-sm text-[var(--muted-foreground)]">Aucune donnée pour cette période.</p>;
  }

  const top = points.slice(0, 10);
  return (
    <div className="h-[320px] w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={top} layout="vertical" margin={{ top: 8, right: 12, left: 16, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v) => euroFmt.format(Number(v))}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            type="category"
            dataKey="category"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={120}
          />
          <Tooltip content={<TooltipContent />} />
          <Bar dataKey="amount" radius={[0, 6, 6, 0]}>
            {top.map((p) => (
              <Cell key={p.category} fill={color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
