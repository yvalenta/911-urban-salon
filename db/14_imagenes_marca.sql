-- Imágenes de marca administrables desde /admin → Ajustes.
-- Mapa clave→URL de Storage: {"banner": "...", "logo": "..."}; sin la clave,
-- la landing usa el asset del repo (assets/banner.jpeg, logo del pie).
alter table public.negocio add column if not exists imagenes jsonb;
comment on column public.negocio.imagenes is
  'URLs de imágenes de marca subidas desde Ajustes; ausente = asset por defecto.';
select 'imagenes de marca listas' as resultado;
