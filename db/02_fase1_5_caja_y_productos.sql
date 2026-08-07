-- APLICADA en producción el 2026-08-06.
-- 911 Urban Salón — Fase 1.5: confirmación de atención, motivos, productos y ventas

-- Motivo cuando un turno no se atiende (estado 'cancelado')
alter table public.turnos add column if not exists motivo_no_atencion text;

-- ── Catálogo de productos (gel, cera, etc.) — administrable por el admin ──
create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  precio int not null check (precio >= 0),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table public.productos enable row level security;

drop policy if exists productos_select on public.productos;
create policy productos_select on public.productos
  for select to authenticated using (true);
drop policy if exists productos_admin_ins on public.productos;
create policy productos_admin_ins on public.productos
  for insert to authenticated with check (public.jwt_rol() = 'admin');
drop policy if exists productos_admin_upd on public.productos;
create policy productos_admin_upd on public.productos
  for update to authenticated using (public.jwt_rol() = 'admin') with check (public.jwt_rol() = 'admin');
drop policy if exists productos_admin_del on public.productos;
create policy productos_admin_del on public.productos
  for delete to authenticated using (public.jwt_rol() = 'admin');

-- ── Ventas de productos (pueden ir atadas a un turno o sueltas) ──
create table if not exists public.ventas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid references public.productos(id) on delete set null,
  nombre text not null,
  precio int not null check (precio >= 0),
  cantidad int not null default 1 check (cantidad > 0),
  turno_id uuid references public.turnos(id) on delete set null,
  vendido_por uuid references auth.users(id),
  vendedor text,
  fecha date not null default current_date,
  creado_en timestamptz not null default now()
);
create index if not exists ventas_fecha_idx on public.ventas (fecha);
alter table public.ventas enable row level security;

drop policy if exists ventas_select on public.ventas;
create policy ventas_select on public.ventas
  for select to authenticated using (true);
drop policy if exists ventas_insert on public.ventas;
create policy ventas_insert on public.ventas
  for insert to authenticated
  with check (public.jwt_rol() in ('admin','barbero') and vendido_por = auth.uid());
drop policy if exists ventas_admin_del on public.ventas;
create policy ventas_admin_del on public.ventas
  for delete to authenticated using (public.jwt_rol() = 'admin');

-- Realtime para productos y ventas
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='productos') then
    alter publication supabase_realtime add table public.productos;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='ventas') then
    alter publication supabase_realtime add table public.ventas;
  end if;
end $$;

-- Semilla de catálogo (solo si está vacío)
insert into public.productos (nombre, precio)
select * from (values ('Gel fijador', 25000), ('Cera moldeadora', 30000), ('Aceite para barba', 35000)) v(n, p)
where not exists (select 1 from public.productos);

select 'fase 1.5 aplicada' as resultado,
  (select count(*) from public.productos) as productos;
