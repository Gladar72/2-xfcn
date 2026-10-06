-- Анонимные встречи: организатор и точный адрес скрыты, пока заявку не одобрили.
alter table events add column if not exists is_anonymous boolean not null default false;
