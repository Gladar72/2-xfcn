"use client";

import { useRouter } from "next/navigation";
import clsx from "clsx";

export type ApplicationStatus = "pending" | "accepted" | "rejected";

/**
 * Статус заявки текущего пользователя на встречу — один и тот же вид
 * везде: в карточке ленты, в разделе «Для бизнеса» и на странице события.
 *
 * - pending  — широкая плашка «Заявка отправлена / Ждём ответа организатора»
 * - accepted — зелёная пилюля «Вы в событии» + подпись «Организатор подтвердил»
 * - rejected — красная плашка «Заявка не подтверждена» + кнопка «Смотреть другие»
 *
 * Компонент может стоять внутри карточки-ссылки (<Link>), поэтому
 * кнопка «Смотреть другие» — это <button> с router.push, а не вложенная
 * ссылка (вложенные <a> в HTML запрещены и ломают клик по карточке).
 */
export function ApplicationStatusView({
  status,
  layout = "wide",
}: {
  status: ApplicationStatus;
  /** wide — на всю ширину (страница события, карточки без фото); compact — колонка под фото в карточке. */
  layout?: "wide" | "compact";
}) {
  if (status === "pending") return <PendingBlock />;
  if (status === "accepted") return <AcceptedBlock layout={layout} />;
  return <RejectedBlock layout={layout} />;
}

function PendingBlock() {
  return (
    <div className="flex w-full items-center gap-3 rounded-[16px] bg-lavender-100 px-4 py-3">
      <HourglassIcon />
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-tight text-accent">Заявка отправлена</div>
        <div className="mt-0.5 text-xs leading-tight text-ink-600">Ждём ответа организатора</div>
      </div>
    </div>
  );
}

function AcceptedBlock({ layout }: { layout: "wide" | "compact" }) {
  return (
    <div className={clsx("flex flex-col gap-1.5", layout === "compact" ? "items-end" : "items-stretch")}>
      <div
        className={clsx(
          "flex items-center justify-center gap-2 whitespace-nowrap rounded-pill bg-[#DDF7E6] font-semibold text-[#1E8E4E]",
          layout === "compact" ? "px-3.5 py-2 text-sm" : "py-4 text-base"
        )}
      >
        <CheckIcon />
        Вы в событии
      </div>
      <div
        className={clsx(
          "whitespace-nowrap text-ink-400",
          layout === "compact" ? "text-caption" : "text-center text-xs"
        )}
      >
        Организатор подтвердил
      </div>
    </div>
  );
}

function RejectedBlock({ layout }: { layout: "wide" | "compact" }) {
  const router = useRouter();
  return (
    <div className={clsx("flex flex-col gap-2", layout === "compact" ? "items-end" : "items-stretch")}>
      <div
        className={clsx(
          "flex items-center gap-2 rounded-[16px] bg-[#FDE8EC]",
          layout === "compact" ? "px-2.5 py-2" : "px-4 py-3"
        )}
      >
        <CrossIcon />
        <div className="min-w-0">
          <div
            className={clsx(
              "whitespace-nowrap font-semibold leading-tight text-[#E5334B]",
              layout === "compact" ? "text-xs" : "text-sm"
            )}
          >
            Заявка не подтверждена
          </div>
          <div
            className={clsx(
              "mt-0.5 leading-tight text-ink-600",
              layout === "compact" ? "text-caption" : "text-xs"
            )}
          >
            Вы не участвуете
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          router.push("/search");
        }}
        className={clsx(
          "rounded-pill bg-lavender-100 font-semibold text-accent active:scale-95",
          layout === "compact" ? "px-4 py-2 text-sm" : "py-3.5 text-base"
        )}
      >
        Смотреть другие
      </button>
    </div>
  );
}

function HourglassIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-accent">
      <path
        d="M6 3h12M6 21h12M7 3v3.5a5 5 0 0 0 2.2 4.1L12 12l2.8-1.4A5 5 0 0 0 17 6.5V3M7 21v-3.5a5 5 0 0 1 2.2-4.1L12 12l2.8 1.4A5 5 0 0 1 17 17.5V21"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9.5 19h5l-2.5-2z" fill="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <circle cx="12" cy="12" r="11" fill="#F0435E" />
      <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
