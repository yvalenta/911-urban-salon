-- APLICADA en producción el 2026-08-06. Guardada aquí para poder reconstruir
-- el proyecto desde cero (este repo es público: las claves de semilla son
-- marcadores — reemplázalas al aplicar y cámbialas después con crypt()).
-- 911 Urban Salón — Fase 1: cola de turnos compartida + roles admin/barbero
create extension if not exists pgcrypto;

-- ── Tabla de turnos ──
create table if not exists public.turnos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  cliente text not null,
  telefono text,
  servicios text not null,
  precio_total int,
  dur_min int,
  barbero_id uuid references auth.users(id),
  barbero_nombre text not null,
  fecha date not null default current_date,
  hora time not null,
  hora_original time,
  estado text not null default 'espera'
    check (estado in ('espera','silla','pausado','listo','cancelado')),
  iniciado_en timestamptz,
  pausado_en timestamptz,
  pausa_acum_seg int not null default 0,
  orden serial,
  creado_en timestamptz not null default now()
);
create index if not exists turnos_fecha_idx on public.turnos (fecha, orden);

alter table public.turnos enable row level security;

-- Rol desde el JWT: app_metadata no es editable por el usuario final.
create or replace function public.jwt_rol() returns text
language sql stable as $$
  select coalesce(auth.jwt()->'app_metadata'->>'rol','');
$$;

drop policy if exists turnos_select on public.turnos;
create policy turnos_select on public.turnos
  for select to authenticated using (true);

drop policy if exists turnos_insert_admin on public.turnos;
create policy turnos_insert_admin on public.turnos
  for insert to authenticated with check (public.jwt_rol() = 'admin');

drop policy if exists turnos_update on public.turnos;
create policy turnos_update on public.turnos
  for update to authenticated
  using (public.jwt_rol() = 'admin'
         or (public.jwt_rol() = 'barbero' and barbero_id = auth.uid()))
  with check (public.jwt_rol() = 'admin'
         or (public.jwt_rol() = 'barbero' and barbero_id = auth.uid()));

drop policy if exists turnos_delete_admin on public.turnos;
create policy turnos_delete_admin on public.turnos
  for delete to authenticated using (public.jwt_rol() = 'admin');

-- Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'turnos'
  ) then
    alter publication supabase_realtime add table public.turnos;
  end if;
end $$;

-- ── Cuentas: admin + barberos (email sintético usuario@911urban.local) ──
do $$
declare
  uid uuid;
  usuarios text[][] := array[
    array['admin@911urban.local','CAMBIA_CLAVE_ADMIN','Admin','admin'],
    array['samuel@911urban.local','CAMBIA_CLAVE_BARBERO','Samuel','barbero'],
    array['mateo@911urban.local','CAMBIA_CLAVE_BARBERO','Mateo','barbero'],
    array['julian@911urban.local','CAMBIA_CLAVE_BARBERO','Julián','barbero']
  ];
  u text[];
begin
  foreach u slice 1 in array usuarios loop
    select id into uid from auth.users where email = u[1];
    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        u[1], crypt(u[2], gen_salt('bf')), now(),
        jsonb_build_object('provider','email','providers',jsonb_build_array('email'),'rol',u[4],'nombre',u[3]),
        jsonb_build_object('nombre',u[3]), now(), now(), '', '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), uid, uid::text,
        jsonb_build_object('sub', uid::text, 'email', u[1], 'email_verified', true),
        'email', now(), now(), now());
    end if;
  end loop;
end $$;

-- ── Cola de hoy (semilla solo si el día está vacío) ──
do $$
declare
  sam uuid; mat uuid; jul uuid;
begin
  if not exists (select 1 from public.turnos where fecha = current_date) then
    select id into sam from auth.users where email = 'samuel@911urban.local';
    select id into mat from auth.users where email = 'mateo@911urban.local';
    select id into jul from auth.users where email = 'julian@911urban.local';
    insert into public.turnos (codigo, cliente, servicios, barbero_id, barbero_nombre, fecha, hora, estado, iniciado_en, dur_min, precio_total) values
      ('A-014','Mateo L.','Fade texturizado', sam,'Samuel', current_date,'12:00','silla', now() - interval '8 minutes', 50, 50000),
      ('A-015','Andrés M.','Skin fade', sam,'Samuel', current_date,'12:45','espera', null, 45, 50000),
      ('A-016','Sebastián R.','Afeitado clásico', mat,'Mateo', current_date,'12:45','espera', null, 30, 70000),
      ('A-017','Julián V.','Trenzas', jul,'Julián', current_date,'13:30','espera', null, 90, 100000),
      ('A-018','Carolina T.','Masaje facial', null,'Masajista por confirmar', current_date,'13:30','espera', null, 40, 150000);
  end if;
end $$;

select 'migración aplicada' as resultado,
  (select count(*) from public.turnos where fecha = current_date) as turnos_hoy,
  (select count(*) from auth.users where email like '%@911urban.local') as cuentas;
