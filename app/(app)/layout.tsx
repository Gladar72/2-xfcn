import { BottomNav } from "@/components/layout/BottomNav";
import { PendingReviewModal } from "@/components/reviews/PendingReviewModal";

export default function AppSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-24">
      {children}
      <BottomNav />
      <PendingReviewModal />
    </div>
  );
}
