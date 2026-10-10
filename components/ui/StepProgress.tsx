interface StepProgressProps {
  currentStep: number; // 1-indexed
  totalSteps: number;
}

export function StepProgress({ currentStep, totalSteps }: StepProgressProps) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
        <div
          key={step}
          className={`h-1.5 flex-1 rounded-pill transition-colors duration-500 ${
            step <= currentStep ? "bg-brand-gradient" : "bg-white/60 shadow-[inset_0_0_0_1px_rgba(255,255,255,.9)]"
          }`}
        />
      ))}
    </div>
  );
}
