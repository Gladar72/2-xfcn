"use client";

import { Button } from "@/components/ui/Button";
import type { Plan, PlanLimits } from "@/lib/subscriptions/limits";

interface PlanCardProps {
  plan: Plan;
  limits: PlanLimits;
  features: string[];
  highlighted?: boolean;
  loading?: boolean;
  onSelect: (plan: Plan) => void;
}

const PLAN_TITLES: Record<Plan, string> = {
  start: "START",
  medium: "MEDIUM",
  premium: "PREMIUM",
};

export function PlanCard({ plan, limits, features, highlighted, loading, onSelect }: PlanCardProps) {
  return (
    <div
      className={`rounded-card p-5 shadow-card ${
        highlighted ? "bg-ink-900 text-white" : "bg-white text-ink-900"
      }`}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-title">{PLAN_TITLES[plan]}</h3>
        <span className="text-lg font-bold">{limits.priceRub} ₽/мес</span>
      </div>

      <ul className="mb-4 space-y-1.5 text-sm">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <span>·</span>
            {feature}
          </li>
        ))}
      </ul>

      <Button
        variant={highlighted ? "primary" : "secondary"}
        onClick={() => onSelect(plan)}
        disabled={loading}
        className={highlighted ? "" : undefined}
      >
        {loading ? "Открываем оплату..." : "Выбрать"}
      </Button>
    </div>
  );
}
