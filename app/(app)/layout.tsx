import { Suspense } from "react";
import { BottomNav } from "@/components/layout/BottomNav";
import { PendingReviewModal } from "@/components/reviews/PendingReviewModal";

/**
 * Корень приложения — контейнер .P из прототипа (стили app/proto.css):
 * каждый экран внутри — <section class="scr aurora"> со своей прокруткой,
 * таббар и шторки — поверх, как в презентации.
 */
export default function AppSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="P">
      {children}
      <Suspense>
        <BottomNav />
      </Suspense>
      <PendingReviewModal />
    </div>
  );
}
