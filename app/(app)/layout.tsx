import { BottomNav } from "@/components/layout/BottomNav";
import { PendingReviewModal } from "@/components/reviews/PendingReviewModal";

export default function AppSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="m-page min-h-screen pb-28">
      {children}
      <BottomNav />
      <PendingReviewModal />
    </div>
  );
}
