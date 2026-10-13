-- После копирования фото: ссылки в базе с Supabase Cloud → на свой сервер.
-- Старый и новый адрес задаёт remote.sh (SET mesto.old / mesto.new перед этим файлом).
DO $$
DECLARE r record; n bigint; total bigint := 0;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.data_type IN ('text', 'character varying', 'jsonb', 'ARRAY')
  LOOP
    IF r.data_type = 'jsonb' THEN
      EXECUTE format('UPDATE public.%I SET %I = replace(%I::text, %L, %L)::jsonb WHERE %I::text LIKE %L',
        r.table_name, r.column_name, r.column_name, current_setting('mesto.old'), current_setting('mesto.new'), r.column_name, '%' || current_setting('mesto.old') || '%');
    ELSIF r.data_type = 'ARRAY' THEN
      CONTINUE;
    ELSE
      EXECUTE format('UPDATE public.%I SET %I = replace(%I, %L, %L) WHERE %I LIKE %L',
        r.table_name, r.column_name, r.column_name, current_setting('mesto.old'), current_setting('mesto.new'), r.column_name, '%' || current_setting('mesto.old') || '%');
    END IF;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE NOTICE '%.%: % rows', r.table_name, r.column_name, n; total := total + n; END IF;
  END LOOP;
  RAISE NOTICE 'total rewritten: %', total;
END $$;
