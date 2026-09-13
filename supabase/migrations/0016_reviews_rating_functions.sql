-- 0016_reviews_rating_functions.sql

-- Пересчитывает средний рейтинг пользователя при добавлении нового отзыва.
-- Формула — инкрементальное среднее, без чтения-потом-записи из приложения,
-- чтобы два параллельных отзыва не затёрли друг друга.
create or replace function apply_review_to_rating(p_user_id uuid, p_rating smallint)
returns void
language sql
security definer
as $$
  update users
  set
    rating_avg = round(((rating_avg * rating_count) + p_rating)::numeric / (rating_count + 1), 2),
    rating_count = rating_count + 1
  where id = p_user_id;
$$;

-- Увеличивает "количество состоявшихся встреч" сразу для всех участников
-- завершённой встречи (вызывается один раз при переходе события в 'completed',
-- см. app/api/n8n/due-review-requests).
create or replace function increment_completed_meetings(p_user_ids uuid[])
returns void
language sql
security definer
as $$
  update users
  set completed_meetings_count = completed_meetings_count + 1
  where id = any(p_user_ids);
$$;
