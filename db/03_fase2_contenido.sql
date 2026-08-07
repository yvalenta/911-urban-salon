-- APLICADA en producción el 2026-08-06.
-- 911 Urban Salón — Fase 2: contenido del sitio editable desde el panel
-- (negocio + servicios + imágenes en Storage). La landing lee con la anon key.

-- ── Datos del negocio (una fila; slug pensado para multi-negocio futuro) ──
create table if not exists public.negocio (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null default '911urban',
  nombre text not null default '911 Urban Salón',
  telefono text,
  direccion text,
  horario jsonb,
  equipo jsonb,
  tema jsonb, -- reservado: paleta/logo para plantillas white-label
  actualizado_en timestamptz not null default now()
);
alter table public.negocio enable row level security;

drop policy if exists negocio_select on public.negocio;
create policy negocio_select on public.negocio
  for select to anon, authenticated using (true);
drop policy if exists negocio_admin_upd on public.negocio;
create policy negocio_admin_upd on public.negocio
  for update to authenticated using (public.jwt_rol() = 'admin') with check (public.jwt_rol() = 'admin');
drop policy if exists negocio_admin_ins on public.negocio;
create policy negocio_admin_ins on public.negocio
  for insert to authenticated with check (public.jwt_rol() = 'admin');

-- ── Carta de servicios ──
create table if not exists public.servicios (
  id uuid primary key default gen_random_uuid(),
  categoria text not null check (categoria in ('cortes','spa','barberia')),
  nombre text not null,
  precio int not null default 0 check (precio >= 0),
  dur_min int not null default 45 check (dur_min > 0),
  estado text not null default 'disponible' check (estado in ('disponible','agotado','borrador')),
  descripcion text,
  img text,   -- nombre de asset local o URL completa de Storage
  icon text,
  badge text,
  orden int not null default 0,
  creado_en timestamptz not null default now()
);
alter table public.servicios enable row level security;

drop policy if exists servicios_select on public.servicios;
create policy servicios_select on public.servicios
  for select to anon, authenticated using (true);
drop policy if exists servicios_admin_ins on public.servicios;
create policy servicios_admin_ins on public.servicios
  for insert to authenticated with check (public.jwt_rol() = 'admin');
drop policy if exists servicios_admin_upd on public.servicios;
create policy servicios_admin_upd on public.servicios
  for update to authenticated using (public.jwt_rol() = 'admin') with check (public.jwt_rol() = 'admin');
drop policy if exists servicios_admin_del on public.servicios;
create policy servicios_admin_del on public.servicios
  for delete to authenticated using (public.jwt_rol() = 'admin');

-- ── Storage: bucket público para fotos de la carta (y logo a futuro) ──
insert into storage.buckets (id, name, public) values ('publico', 'publico', true)
on conflict (id) do nothing;

drop policy if exists publico_lectura on storage.objects;
create policy publico_lectura on storage.objects
  for select using (bucket_id = 'publico');
drop policy if exists publico_admin_ins on storage.objects;
create policy publico_admin_ins on storage.objects
  for insert to authenticated with check (bucket_id = 'publico' and public.jwt_rol() = 'admin');
drop policy if exists publico_admin_upd on storage.objects;
create policy publico_admin_upd on storage.objects
  for update to authenticated using (bucket_id = 'publico' and public.jwt_rol() = 'admin');
drop policy if exists publico_admin_del on storage.objects;
create policy publico_admin_del on storage.objects
  for delete to authenticated using (bucket_id = 'publico' and public.jwt_rol() = 'admin');

-- ── Realtime ──
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='negocio') then
    alter publication supabase_realtime add table public.negocio;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='servicios') then
    alter publication supabase_realtime add table public.servicios;
  end if;
end $$;

-- ── Semilla: el contenido actual de DATA_911 (solo si está vacío) ──
insert into public.negocio (slug, nombre, telefono, direccion, horario, equipo)
select '911urban', '911 Urban Salón', '573205042058',
  'Cra. 32, Mall La Visitación, Transversal Inferior — El Poblado, Medellín, Antioquia',
  '{"dias":"De miércoles a lunes","etiqueta":"12:00 p.m — 9:00 p.m","apertura":12,"fin":21,"cierre":"Martes cerrado","nota":"Barberos y masajistas en jornada continua."}'::jsonb,
  '[{"nombre":"Samuel","rol":"Barbero","especialidad":"Fades y cortes clásicos","estado":"libre","proximo":"11:30"},
    {"nombre":"Mateo","rol":"Barbero","especialidad":"Crop y texturizados","estado":"turno","proximo":"14:00"},
    {"nombre":"Julián","rol":"Barbero","especialidad":"Trenzas y tintura","estado":"libre","proximo":"10:30"},
    {"nombre":"Masajista por confirmar","rol":"Masajista","especialidad":"Piedras calientes y masoterapia","estado":"libre","proximo":"10:00"}]'::jsonb
where not exists (select 1 from public.negocio);

insert into public.servicios (categoria, nombre, precio, dur_min, descripcion, img, icon, badge, orden)
select * from (values
  ('cortes','Skin fade',50000,45,'Degradado a piel con línea marcada.','skin-fade',null,'Más pedido',1),
  ('cortes','Wolf cut',50000,60,'Capas desconectadas y volumen arriba.','wolf-cut',null,null,2),
  ('cortes','Crop texturizado',50000,45,'Flequillo corto con textura y desvanecido.','crop-texturizado',null,null,3),
  ('cortes','Fade texturizado',50000,50,'Fade medio con acabado desordenado.','fade-texturizado',null,null,4),
  ('spa','Spa de pies',150000,50,'Limpieza, higienización e hidratación.',null,'footprints',null,1),
  ('spa','Masaje relajante',150000,60,'Con piedras calientes.',null,'flame',null,2),
  ('spa','Masaje facial',150000,40,'Limpieza e hidratación.',null,'smile',null,3),
  ('spa','Masoterapia',150000,75,'Técnicas terapéuticas para alivio de dolores, estrés y bienestar general.',null,'waves',null,4),
  ('barberia','Trenzas',100000,90,null,null,null,null,1),
  ('barberia','Tintura',150000,90,null,null,null,null,2),
  ('barberia','Afeitado clásico',70000,30,null,null,null,null,3)
) v(categoria, nombre, precio, dur_min, descripcion, img, icon, badge, orden)
where not exists (select 1 from public.servicios);

select 'fase 2 aplicada' as resultado,
  (select count(*) from public.negocio) as negocios,
  (select count(*) from public.servicios) as servicios;
