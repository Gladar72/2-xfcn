-- Подарок за установку приложения (решение 14.11.2026): кто впервые зашёл
-- из приложения App Store / RuStore — «Старт» на 30 дней (поверх текущего тарифа
-- срок продлевается). Один раз на аккаунт.
create table if not exists app_install_gifts (
  user_id uuid primary key,
  platform text not null,
  granted_at timestamptz not null default now()
);
