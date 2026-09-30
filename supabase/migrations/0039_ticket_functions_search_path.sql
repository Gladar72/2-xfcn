-- Фиксируем search_path у функций билетов (советник Supabase:
-- function_search_path_mutable). Поведение не меняется.
alter function public.event_ticket_prefix(uuid) set search_path = public;
alter function public.generate_ticket_code(uuid) set search_path = public;
alter function public.assign_event_ticket() set search_path = public;
