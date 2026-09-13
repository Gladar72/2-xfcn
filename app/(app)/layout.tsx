import { BottomNav } from "@/components/layout/BottomNav";

export default function AppSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-24">
      {children}
      <BottomNav />
    </div>
  );
}
