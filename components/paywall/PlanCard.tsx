"use client";

import Image from "next/image";
import type { Plan, PlanLimits } from "@/lib/subscriptions/limits";

interface PlanCardProps {
  plan: Plan;
  limits: PlanLimits;
  features: string[];
  highlighted?: boolean;
  loadingCard?: boolean;
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
    icon: "/brand/mosya/mosya_wave.webp",
    cardClass: "m-glass",
    titleClass: "text-ink-900",
    textClass: "text-ink-600",
    buttonVariant: "secondary",
  },
  medium: {
    icon: "/brand/mosya/mosya_glasses.webp",
    cardClass: "bg-brand-gradient",
    titleClass: "text-white",
    textClass: "text-white/80",
    buttonVariant: "primary",
  },
  premium: {
    icon: "/brand/mosya/mosya_jump.webp",
    cardClass: "bg-[linear-gradient(150deg,#2A1F4E_0%,#5B3AA8_60%,#C871B6_100%)]",
    titleClass: "text-white",
    textClass: "text-white/70",
    buttonVariant: "primary",
  },
};

export function PlanCard({ plan, limits, features, highlighted, loadingCard, onSelectCard }: PlanCardProps) {
  const visual = PLAN_VISUALS[plan];

  return (
    <div className={`relative overflow-hidden rounded-card-lg p-5 shadow-card-lg ${visual.cardClass}`}>
      {highlighted && (
        <span className="absolute right-5 top-5 rounded-pill bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
          Популярный
        </span>
      )}

      <div className="mb-3 flex items-center gap-3">
        <div className="relative h-16 w-16 shrink-0">
          <Image src={visual.icon} alt="" fill className="object-contain" sizes="64px" />
        </div>
        <div>
          <h3 className={`text-[22px] font-medium tracking-tight ${visual.titleClass}`}>{PLAN_TITLES[plan]}</h3>
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

      <button
        onClick={() => onSelectCard(plan)}
        disabled={loadingCard}
        className={`m-btn h-[52px] text-[15px] ${
          visual.buttonVariant === "primary" ? "bg-white text-ink-900" : "m-btn-v"
        }`}
      >
        {loadingCard ? "Открываем оплату..." : "Оплата картой / СБП"}
      </button>
    </div>
  );
}
