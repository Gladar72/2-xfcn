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
          className={`h-1.5 flex-1 rounded-pill ${
            step <= currentStep ? "bg-brand-gradient" : "bg-lavender-100"
          }`}
        />
      ))}
    </div>
  );
}
