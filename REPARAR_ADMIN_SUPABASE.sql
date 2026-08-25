-- =============================================================
-- APIARIO LA RUDA - REPARACIÓN ADMIN / RPC
-- Ejecutar completo en Supabase > SQL Editor > Run.
-- Es idempotente: puede ejecutarse más de una vez.
-- No borra ni modifica pedidos.
-- =============================================================

begin;

-- 1) Tabla que identifica qué usuario Auth es administrador.
create table if not exists public.la_ruda_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.la_ruda_admins enable row level security;
revoke all on table public.la_ruda_admins from anon, authenticated;

-- 2) Vincular el administrador existente de forma segura.
--    - Si ya hay un admin registrado, lo conserva.
--    - Si existe el antiguo admin@apiariolaruda.local, lo usa.
--    - Si hay un único usuario en Auth, usa ese usuario.
do $$
declare
  v_user uuid;
  v_auth_count integer;
  v_admin_count integer;
begin
  select count(*) into v_admin_count from public.la_ruda_admins;

  if v_admin_count = 0 then
    select id
      into v_user
      from auth.users
     where lower(email) = 'admin@apiariolaruda.local'
     order by created_at
     limit 1;

    if v_user is null then
      select count(*) into v_auth_count from auth.users;

      if v_auth_count = 1 then
        select id
          into v_user
          from auth.users
         order by created_at
         limit 1;
      end if;
    end if;

    if v_user is null then
      raise exception 'No pude determinar automáticamente el administrador. Hay varios usuarios en Authentication > Users. Conservá solo el usuario admin o insertá manualmente su UUID en public.la_ruda_admins.';
    end if;

    insert into public.la_ruda_admins(user_id)
    values (v_user)
    on conflict (user_id) do nothing;
  end if;
end $$;

-- 3) RPC SIN PARÁMETROS que usa el panel para validar acceso.
drop function if exists public.la_ruda_is_admin();

create function public.la_ruda_is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.la_ruda_admins a
     where a.user_id = auth.uid()
  );
$$;

revoke all on function public.la_ruda_is_admin() from public;
grant execute on function public.la_ruda_is_admin() to authenticated;

-- 4) RLS de pedidos basada en UUID y no en email.
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;

drop policy if exists admin_orders_all on public.orders;
create policy admin_orders_all
on public.orders
for all
to authenticated
using (public.la_ruda_is_admin())
with check (public.la_ruda_is_admin());

drop policy if exists admin_order_items_all on public.order_items;
create policy admin_order_items_all
on public.order_items
for all
to authenticated
using (public.la_ruda_is_admin())
with check (public.la_ruda_is_admin());

drop policy if exists admin_order_history_all on public.order_status_history;
create policy admin_order_history_all
on public.order_status_history
for all
to authenticated
using (public.la_ruda_is_admin())
with check (public.la_ruda_is_admin());

commit;

-- 5) Forzar a PostgREST/Supabase Data API a volver a leer las funciones.
NOTIFY pgrst, 'reload schema';

-- 6) Verificación. Debe devolver una fila con function_name = la_ruda_is_admin
--    y arguments vacío.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'la_ruda_is_admin';
