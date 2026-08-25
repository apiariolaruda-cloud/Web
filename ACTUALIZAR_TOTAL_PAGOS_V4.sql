-- =============================================================
-- APIARIO LA RUDA - SEGUIMIENTO V4
-- Total público + precios por artículo + fechas de pago
--
-- Ejecutar UNA sola vez en Supabase > SQL Editor > Run.
-- No borra pedidos ni modifica datos existentes.
-- Las fechas de "Pendiente de pago" y "Pago confirmado" se obtienen
-- del historial que ya registra automáticamente el trigger de estados.
-- =============================================================

begin;

create or replace function public.get_public_order(p_tracking_code text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'tracking_code', o.tracking_code,
    'status', o.status,
    'nucleo_stage', o.nucleo_stage,
    'reina_stage', o.reina_stage,
    'estimated_date', o.estimated_date,
    'delivery_method', o.delivery_method,
    'total', o.total,
    'public_note', o.public_note,
    'created_at', o.created_at,
    'updated_at', o.updated_at,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'product_code', i.product_code,
          'product_type', i.product_type,
          'description', i.description,
          'quantity', i.quantity,
          'unit', i.unit,
          'unit_price', i.unit_price
        ) order by i.sort_order, i.id
      )
      from public.order_items i
      where i.order_id = o.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'status', h.status,
          'created_at', h.created_at
        ) order by h.created_at, h.id
      )
      from public.order_status_history h
      where h.order_id = o.id
    ), '[]'::jsonb),
    'prep_history', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'preparation_type', h.preparation_type,
          'stage', h.stage,
          'created_at', h.created_at
        ) order by h.created_at, h.id
      )
      from public.order_preparation_history h
      where h.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  where upper(trim(o.tracking_code)) = upper(trim(p_tracking_code))
  limit 1;
$$;

revoke all on function public.get_public_order(text) from public;
grant execute on function public.get_public_order(text) to anon, authenticated;

NOTIFY pgrst, 'reload schema';
commit;

select
  'OK - V4 total y pagos instalada' as resultado,
  to_regprocedure('public.get_public_order(text)') is not null as seguimiento_publico_ok,
  to_regclass('public.order_status_history') is not null as historial_pago_ok;
