-- =============================================================
-- APIARIO LA RUDA - ACTUALIZACIÓN DE SEGUIMIENTO PÚBLICO
-- Ejecutar UNA VEZ en Supabase > SQL Editor.
--
-- Quita el nombre del comprador de la respuesta pública.
-- No borra el nombre de la administración ni modifica pedidos.
-- =============================================================

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
    'estimated_date', o.estimated_date,
    'delivery_method', o.delivery_method,
    'public_note', o.public_note,
    'created_at', o.created_at,
    'updated_at', o.updated_at,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'description', i.description,
          'quantity', i.quantity,
          'unit', i.unit
        )
        order by i.sort_order, i.id
      )
      from public.order_items i
      where i.order_id = o.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'status', h.status,
          'created_at', h.created_at
        )
        order by h.created_at, h.id
      )
      from public.order_status_history h
      where h.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  where upper(trim(o.tracking_code)) = upper(trim(p_tracking_code))
  limit 1;
$$;

revoke all on function public.get_public_order(text) from public;
grant execute on function public.get_public_order(text) to anon, authenticated;

notify pgrst, 'reload schema';

select 'OK - seguimiento público sin nombre del comprador' as resultado;
