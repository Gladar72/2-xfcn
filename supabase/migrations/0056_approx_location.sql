-- «Люди рядом»: примерное расстояние между людьми.
-- Безопасность: храним только округлённую точку (сетка ~500 м),
-- наружу отдаём лишь расстояние, округлённое до километра.
alter table public.users
  add column if not exists approx_lat numeric(8,3),
  add column if not exists approx_lon numeric(8,3),
  add column if not exists approx_location_at timestamptz,
  add column if not exists show_distance boolean not null default true;
