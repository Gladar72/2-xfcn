import { getAdminUser } from "@/lib/admin/is-admin";
import Link from "next/link";

const SECTIONS = [
  { href: "/admin", label: "Обзор" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/reviews", label: "Reviews" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminUser();

  if (!admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-900 px-6 text-center">
        <p className="text-white">
          Доступ запрещён. Этот раздел виден только администраторам
          (см. переменную окружения <code>ADMIN_TELEGRAM_IDS</code>).
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-ink-400/10 bg-white px-6 py-4">
        <h1 className="text-title">Meetup App — Admin</h1>
        <nav className="mt-3 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-pill bg-background px-4 py-1.5 text-sm font-medium text-ink-900"
            >
              {s.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
