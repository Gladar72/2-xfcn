import Link from "next/link";

// Публичная страница поддержки (без входа) — её адрес указан в App Store и RuStore.
export const metadata = { title: "Поддержка — Место" };

export default function SupportInfoPage() {
  return (
    <div className="P">
      <section className="scr aurora in" data-id="doc">
        <div className="scroll">
          <h1 className="t" style={{ marginTop: 18 }}>Поддержка «Места»</h1>
          <div className="docb gl">
            <p>
              «Место» — приложение, где легко найти компанию на сегодня: создай встречу или присоединись к той, что
              уже собирается рядом, — бег, кофе, кино, ужин, прогулка. Есть карта города, афиша заведений и люди с
              похожими интересами.
            </p>
            <h2 className="font-semibold">Как с нами связаться</h2>
            <p>
              Почта: <a href="mailto:support@mesto-go.ru">support@mesto-go.ru</a>
              <br />
              Telegram: <a href="https://t.me/Mesto_people_bot">@Mesto_people_bot</a>
              <br />
              Отвечаем в течение рабочего дня.
            </p>
            <h2 className="font-semibold">Частые вопросы</h2>
            <p>
              <b>Как удалить аккаунт?</b> В приложении: Профиль → Настройки → «Удалить аккаунт». Или напишите нам на
              почту — удалим вручную.
            </p>
            <p>
              <b>Сколько стоит?</b> Первый месяц — бесплатно: каждый новый пользователь получает тариф «Старт» на 30
              дней. Дальше — подписка «Старт», «Медиум» или «Премьер» на выбор.
            </p>
            <p>
              <b>Как пожаловаться на человека?</b> В профиле человека — флажок «Пожаловаться или заблокировать».
              Модерация отвечает в течение суток.
            </p>
            <p>
              <Link href="/legal/privacy">Политика конфиденциальности</Link> · <Link href="/legal/offer">Условия использования</Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
