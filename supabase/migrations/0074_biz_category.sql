-- Раздел бизнес-события («Бары», «Вечеринки и клубы», «Концерты»…): организатор
-- выбирает его при создании, по нему работают фильтры «Для бизнеса».
-- Раньше раздел угадывали по названию, и «Я ебал» (вечеринка) не попадал в «Вечеринки».
-- Идемпотентно: запускается при каждом деплое, трогает только события без раздела.
alter table public.events add column if not exists biz_category text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_biz_category_check') then
    alter table public.events add constraint events_biz_category_check check (
      biz_category is null or biz_category in
        ('bars','party','concerts','food','workshops','kids','theatre','art','games','cinema','sport','other')
    );
  end if;
end $$;

-- Явная правка: «Я ебал» — вечеринка.
update public.events set biz_category = 'party'
where is_business and (biz_category is null or biz_category = 'other') and lower(title) ~ '^\s*я\s+ебал';

-- Остальные старые бизнес-события раскладываем по названию (как раньше угадывал сайт).
update public.events e set biz_category = case
  when t ~ '(^|[^а-яё])(дет(и|ям|ск)|семейн|малыш)' then 'kids'
  when t ~ 'вечеринк|(^|[^а-яё])клуб|(^|[^а-яё])dj([^a-z]|$)|диджей|(^|[^а-яё])пати|party|техно|рейв|дискотек' then 'party'
  when t ~ '(^|[^а-яё])бар([^а-яё]|$)|коктейл|(^|[^а-яё])паб([^а-яё]|$)|караоке|кальян|лаунж' then 'bars'
  when t ~ 'концерт|(^|[^a-z])live([^a-z]|$)|лайв|джаз|(^|[^а-яё])рок([^а-яё]|$)|акустик|фестивал|кавер|оркестр' then 'concerts'
  when t ~ 'спектакл|театр|стендап|stand.?up|балет|импров|комеди|(^|[^а-яё])опер[аеуы]([^а-яё]|$)' then 'theatre'
  when t ~ 'мастер.?класс|(^|[^а-яё])мк([^а-яё]|$)|воркшоп|workshop|лекци|(^|[^а-яё])курс|тренинг|(^|[^а-яё])урок' then 'workshops'
  when t ~ 'выставк|экскурси|музей|галере|(^|[^а-яё])арт([^а-яё]|-|$)|маркет|ярмарк' then 'art'
  when t ~ 'квиз|quiz|настолк|игр[аы]|мафи|турнир' then 'games'
  when t ~ '(^|[^а-яё])кино|фильм' then 'cinema'
  when t ~ 'забег|(^|[^а-яё])йог|тренировк|спорт|фитнес|растяжк|(^|[^а-яё])бег([^а-яё]|$)' then 'sport'
  when t ~ 'кофе|завтрак|бранч|ужин|обед|дегустац|ресторан|кафе|гастро|винн|пицц|суши|кухн' then 'food'
  else 'other'
end
from (select id, lower(coalesce(title, '')) as t from public.events where is_business and biz_category is null) s
where e.id = s.id;

notify pgrst, 'reload schema';
