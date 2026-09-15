"use client";

import Image from "next/image";
import { Button } from "@/components/ui/Button";
import type { Plan, PlanLimits } from "@/lib/subscriptions/limits";

interface PlanCardProps {
  plan: Plan;
  limits: PlanLimits;
  features: string[];
  highlighted?: boolean;
  loading?: boolean;
  loadingCard?: boolean;
  onSelect: (plan: Plan) => void;
  onSelectCard: (plan: Plan) => void;
}

// Визуальные названия МЕСТО. Backend-идентификаторы (start/medium/premium)
// не меняются — это только отображаемый текст (см. бриф п.22).
const PLAN_TITLES: Record<Plan, string> = {
  start: "Старт",
  medium: "Медиум",
  premium: "Премьер",
};

const PLAN_VISUALS: Record<
  Plan,
  { icon: string; cardClass: string; titleClass: string; textClass: string; buttonVariant: "primary" | "secondary" }
> = {
  start: {
    icon: "/brand/3d/plan-start.png",
    cardClass: "bg-white border border-lavender-200",
    titleClass: "text-ink-900",
    textClass: "text-ink-600",
    buttonVariant: "secondary",
  },
  medium: {
    icon: "/brand/3d/plan-medium.png",
    cardClass: "bg-brand-gradient",
    titleClass: "text-white",
    textClass: "text-white/80",
    buttonVariant: "primary",
  },
  premium: {
    icon: "/brand/3d/plan-premier.png",
    cardClass: "bg-ink-900",
    titleClass: "text-white",
    textClass: "text-white/70",
    buttonVariant: "primary",
  },
};

export function PlanCard({
  plan,
  limits,
  features,
  highlighted,
  loading,
  loadingCard,
  onSelect,
  onSelectCard,
}: PlanCardProps) {
  const visual = PLAN_VISUALS[plan];

  return (
    <div className={`relative overflow-hidden rounded-card-lg p-5 shadow-card-lg ${visual.cardClass}`}>
      {highlighted && (
        <span className="absolute right-5 top-5 rounded-pill bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
          Популярный
        </span>
      )}

      <div className="mb-3 flex items-center gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-card-sm">
          <Image src={visual.icon} alt="" fill className="object-cover" sizes="56px" />
        </div>
        <div>
          <h3 className={`text-title ${visual.titleClass}`}>{PLAN_TITLES[plan]}</h3>
          <span className={`text-sm font-semibold ${visual.textClass}`}>{limits.priceRub} ₽/мес</span>
        </div>
      </div>

      <ul className={`mb-4 space-y-1.5 text-sm ${visual.textClass}`}>
        {features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <span>·</span>
            {feature}
          </li>
        ))}
      </ul>

      <Button variant={visual.buttonVariant} onClick={() => onSelect(plan)} disabled={loading || loadingCard}>
        {loading ? "Открываем оплату..." : `Оплатить ${limits.priceStars} ⭐`}
      </Button>
      <button
        onClick={() => onSelectCard(plan)}
        disabled={loading || loadingCard}
        className={`mt-2 w-full rounded-pill py-2.5 text-sm font-medium underline ${visual.textClass}`}
      >
        {loadingCard ? "Открываем оплату..." : "Оплатить картой / СБП"}
      </button>
    </div>
  );
}
