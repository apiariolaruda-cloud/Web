-- APIARIO LA RUDA - CORRECCIÓN DE ACCESO ADMINISTRADOR
-- Ejecutar UNA sola vez en Supabase > SQL Editor > Run.
-- No modifica pedidos existentes. No cambia la contraseña.

create table if not exists public.la_ruda_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.la_ruda_admins enable row level security;
revoke all on table public.la_ruda_admins from anon, authenticated;

-- Si actualmente hay un único usuario Auth, lo registra como administrador.
-- Si hay varios, prioriza el antiguo admin@apiariolaruda.local.
do $$
declare
  v_user uuid;
  v_count integer;
begin
  select count(*) into v_count from auth.users;

  select id into v_user
  from auth.users
  where lower(email) = 'admin@apiariolaruda.local'
  order by created_at
  limit 1;

  if v_user is null and v_count = 1 then
    select id into v_user from auth.users order by created_at limit 1;
  end if;

  if v_user is null then
    raise exception 'No se pudo determinar automáticamente el administrador. Hay % usuarios Auth. Eliminá usuarios de prueba o registrá manualmente el UUID correcto.', v_count;
  end if;

  insert into public.la_ruda_admins(user_id) values (v_user)
  on conflict (user_id) do nothing;
end $$;

create or replace function public.la_ruda_is_admin()
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

-- Reemplaza políticas ligadas al email por políticas ligadas al UUID del admin.
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

select 'OK - administrador vinculado por UUID' as resultado;
