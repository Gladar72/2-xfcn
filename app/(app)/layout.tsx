import { Suspense } from "react";
import { BottomNav } from "@/components/layout/BottomNav";
import { PendingReviewModal } from "@/components/reviews/PendingReviewModal";
import { MatchOnOpen } from "@/components/people/MatchOnOpen";
import { HomeScreenAsk } from "@/components/telegram/HomeScreenAsk";

/**
 * Корень приложения — контейнер .P из прототипа (стили app/proto.css):
 * каждый экран внутри — <section class="scr aurora"> со своей прокруткой,
 * таббар и шторки — поверх, как в презентации.
 */
export default function AppSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="P K">
      {children}
      <Suspense>
        <BottomNav />
      </Suspense>
      <PendingReviewModal />
      <MatchOnOpen />
      <HomeScreenAsk />
    </div>
  );
}
