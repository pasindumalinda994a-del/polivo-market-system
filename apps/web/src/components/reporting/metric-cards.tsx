"use client";

type MetricCard = {
  id: string;
  label: string;
  value: string;
  hint?: string;
};

export function MetricCards({ cards, loading }: { cards: MetricCard[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <MetricPanel key={index} label="Loading…" value="—" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <MetricPanel key={card.id} label={card.label} value={card.value} hint={card.hint} />
      ))}
    </div>
  );
}

function MetricPanel({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-background p-4 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
