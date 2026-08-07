#!/usr/bin/env ruby
# frozen_string_literal: true

# Regenera el respaldo embebido de contenido (el bloque window.DATA_911 de
# index.html) a partir de lo que hoy dicen las tablas negocio y servicios.
#
# Por qué existe: la landing monta con el bloque embebido y después se
# corrige con la base (script "Fase 2" de index.html). Si el bloque queda
# viejo, quien entre sin conexión —o mientras Supabase esté caído o
# pausado— ve precios y horarios de otra época. Y editarlo a mano es tener
# las mismas cifras en dos sitios: cada copia manual es un lugar más donde
# desincronizarse. Este script vuelve a alinear el respaldo sin tocar nada
# más del archivo.
#
# Uso:
#   ruby ops/regenerar_respaldo.rb           # reescribe el bloque en index.html
#   ruby ops/regenerar_respaldo.rb --check   # no escribe; sale 0 si el bloque
#                                            # coincide con la base, 1 si está
#                                            # desactualizado, 2 si algo falló
#
# Solo stdlib (net/http, json): corre en cualquier máquina y sirve de
# guarda en CI con --check.

require "net/http"
require "json"
require "uri"

SB = "https://ssrrkcshhrggukknkoua.supabase.co"
# Publishable key: pública por diseño (la misma que va embebida en la
# landing); solo permite lectura anónima vía RLS, no es un secreto.
KEY = "sb_publishable_zLevCihGrnQqqlgM7mXbrw_HyBtvzIj"

INDICE = File.expand_path("../index.html", __dir__)

# index.html tiene DOS "window.DATA_911 = {": una copia dentro del bundle y
# el respaldo real en su propio <script> después de este marcador. El del
# bundle queda pisado por el segundo al cargar la página, así que solo el
# segundo importa (es el único con horario y barberia, además).
MARCADOR = "<!-- ══ Datos de contenido"

def fallar(msg)
  warn "regenerar_respaldo: #{msg}"
  exit 2
end

# ── Lectura de la base ──────────────────────────────────────────────────────

def obtener(ruta)
  uri = URI(SB + ruta)
  res = Net::HTTP.start(uri.host, uri.port, use_ssl: true) do |http|
    pet = Net::HTTP::Get.new(uri)
    pet["apikey"] = KEY
    # Sin gzip: cuando la respuesta crece, el CDN la comprime y Net::HTTP no
    # siempre la infla solo; pedir identity evita depender de zlib.
    pet["accept-encoding"] = "identity"
    http.request(pet)
  end
  fallar("HTTP #{res.code} en #{ruta}") unless res.code == "200"
  # El cuerpo llega etiquetado ASCII-8BIT; sin re-etiquetar, el parser de
  # JSON rechaza las tildes del contenido.
  JSON.parse(res.body.dup.force_encoding(Encoding::UTF_8))
rescue SocketError, Errno::ECONNREFUSED, Net::OpenTimeout => e
  fallar("sin conexión con Supabase (#{e.class}): #{e.message}")
end

# "$50.000": mismo formato que toLocaleString("es-CO") en la landing —
# miles con punto, sin decimales.
def fmt_cop(n)
  "$" + n.to_i.to_s.reverse.scan(/\d{1,3}/).join(".").reverse
end

# ── Lectura del bloque actual ───────────────────────────────────────────────

# Lector mínimo del literal JS del bloque: objetos, arreglos, cadenas entre
# comillas dobles, números, true/false/null y claves sin comillas. No es un
# parser de JavaScript general; cubre exactamente la gramática que el bloque
# usa, y revienta (exit 2) ante cualquier otra cosa — mejor eso que escribir
# un bloque corrupto.
class LectorLiteral
  attr_reader :pos

  def initialize(texto, pos)
    @t = texto
    @pos = pos
  end

  def valor
    saltar
    case @t[@pos]
    when "{" then objeto
    when "[" then arreglo
    when '"' then cadena
    when /[-0-9]/ then numero
    else palabra
    end
  end

  private

  def saltar
    @pos += 1 while @pos < @t.size && @t[@pos] =~ /\s/
  end

  def objeto
    @pos += 1 # {
    h = {}
    loop do
      saltar
      if @t[@pos] == "}"
        @pos += 1
        break
      end
      clave = @t[@pos] == '"' ? cadena : identificador
      saltar
      raise "se esperaba ':' tras la clave #{clave.inspect} (byte #{@pos})" unless @t[@pos] == ":"
      @pos += 1
      h[clave] = valor
      saltar
      @pos += 1 if @t[@pos] == ","
    end
    h
  end

  def arreglo
    @pos += 1 # [
    a = []
    loop do
      saltar
      if @t[@pos] == "]"
        @pos += 1
        break
      end
      a << valor
      saltar
      @pos += 1 if @t[@pos] == ","
    end
    a
  end

  def cadena
    @pos += 1 # "
    sal = +""
    loop do
      c = @t[@pos]
      raise "cadena sin cerrar" if c.nil?
      break if c == '"'
      if c == "\\"
        e = @t[@pos + 1]
        case e
        when "n" then sal << "\n"
        when "t" then sal << "\t"
        when "r" then sal << "\r"
        when "u" then sal << [@t[@pos + 2, 4].to_i(16)].pack("U"); @pos += 4
        when "x" then sal << [@t[@pos + 2, 2].to_i(16)].pack("U"); @pos += 2
        else sal << e
        end
        @pos += 2
      else
        sal << c
        @pos += 1
      end
    end
    @pos += 1 # "
    sal
  end

  def numero
    # \G ancla el patrón en @pos (con \A anclaría al inicio del archivo).
    m = @t.match(/\G-?\d+(\.\d+)?/, @pos)
    @pos += m[0].size
    m[1] ? m[0].to_f : m[0].to_i
  end

  def identificador
    m = @t.match(/\G[A-Za-z_$][A-Za-z0-9_$]*/, @pos)
    raise "clave inválida en byte #{@pos}" unless m
    @pos += m[0].size
    m[0]
  end

  def palabra
    m = @t.match(/\G[a-z]+/, @pos)
    raise "valor inesperado en byte #{@pos}" unless m
    @pos += m[0].size
    case m[0]
    when "true" then true
    when "false" then false
    when "null" then nil
    else raise "palabra desconocida #{m[0].inspect} en byte #{@pos}"
    end
  end
end

# Devuelve [datos, desde, hasta]: el objeto parseado y el rango de bytes que
# cubre "{...};" (para reemplazarlo dejando "window.DATA_911 = " y el resto
# del archivo intactos).
def extraer_bloque(html)
  m = html.index(MARCADOR) or fallar("no encuentro el marcador #{MARCADOR.inspect} en index.html")
  ini = html.index("window.DATA_911 = {", m) or fallar("no encuentro window.DATA_911 después del marcador")
  desde = html.index("{", ini)
  lector = LectorLiteral.new(html, desde)
  datos = begin
    lector.valor
  rescue StandardError => e
    fallar("no pude leer el bloque actual: #{e.message}")
  end
  hasta = lector.pos
  fallar("el bloque no termina en ';'") unless html[hasta] == ";"
  [datos, desde, hasta + 1]
end

# ── Construcción del bloque nuevo ───────────────────────────────────────────

def vivo?(v)
  !v.nil? && v != ""
end

# Espejo del `mapa` del script "Fase 2" de index.html, con una diferencia
# deliberada: las claves vacías se omiten en vez de escribirse como "" o
# null, porque así está escrito el bloque embebido y así el --check no
# marca diferencias puramente cosméticas. `estado: "disponible"` también se
# omite: es el valor por defecto y la UI solo reacciona a "agotado".
def mapear_servicio(s)
  fila = {}
  fila["img"] = s["img"] if vivo?(s["img"])
  fila["icon"] = s["icon"] if vivo?(s["icon"])
  fila["nombre"] = s["nombre"]
  fila["desc"] = s["descripcion"] if vivo?(s["descripcion"])
  fila["precio"] = fmt_cop(s["precio"])
  fila["dur"] = "#{s['dur_min'] || 45} min"
  fila["badge"] = s["badge"] if vivo?(s["badge"])
  fila["estado"] = s["estado"] if vivo?(s["estado"]) && s["estado"] != "disponible"
  fila
end

# Reproduce lo que el script "Fase 2" haría en el navegador con estos mismos
# datos: la meta es que el respaldo coincida con lo que la base pinta en
# vivo. Las claves que no viven en la base (categorias, facial, flujo,
# resenas, faq) se conservan del bloque actual; solo su prosa con precios u
# horarios se rearma, igual que en vivo.
def construir(actual, neg, servicios)
  d = Marshal.load(Marshal.dump(actual)) # copia profunda: no ensuciar `actual`

  if neg
    d["telefono"] = neg["telefono"] if vivo?(neg["telefono"])
    d["direccion"] = neg["direccion"] if vivo?(neg["direccion"])
    d["horario"] = (d["horario"] || {}).merge(neg["horario"]) if neg["horario"].is_a?(Hash)
    if neg["equipo"].is_a?(Array) && !neg["equipo"].empty?
      d["equipo"] = neg["equipo"].map { |p| p.reject { |_, v| v.nil? } }
    end
  end

  if servicios.is_a?(Array) && !servicios.empty?
    %w[cortes spa barberia].each do |cat|
      filas = servicios.select { |s| s["categoria"] == cat }
      d[cat] = filas.map { |s| mapear_servicio(s) } unless filas.empty?
    end
  end

  # Prosa que cita precios: mismo rearmado que hace la página en vivo.
  precio_de = lambda do |lista, frag|
    f = (lista || []).find { |s| s["nombre"].to_s.downcase.include?(frag) }
    f && f["precio"]
  end
  p_corte = d["cortes"] && d["cortes"][0] && d["cortes"][0]["precio"]
  p_masaje = d["spa"] && d["spa"][0] && d["spa"][0]["precio"]
  p_trenzas = precio_de.call(d["barberia"], "trenza")
  p_tintura = precio_de.call(d["barberia"], "tintura")
  p_afeitado = precio_de.call(d["barberia"], "afeit")
  if d["categorias"].is_a?(Array) && d["categorias"].size >= 4
    if p_corte
      d["categorias"][0]["texto"] = "Cualquier corte: #{p_corte}" +
        (p_trenzas ? " · Trenzas: #{p_trenzas}" : "") +
        (p_tintura ? " · Tintura: #{p_tintura}" : "") + "."
    end
    d["categorias"][2]["texto"] = "Spa de pies, piedras calientes, facial y masoterapia. Sesión: #{p_masaje}." if p_masaje
    d["categorias"][3]["texto"] = "Toalla caliente, navaja y perfilado de barba. Afeitado: #{p_afeitado}." if p_afeitado
  end

  # Prosa que cita el horario (misma concatenación que en vivo, incluido el
  # espacio final cuando no hay "cierre": fidelidad antes que estética).
  h = d["horario"] || {}
  if d["faq"].is_a?(Array) && d["faq"][1] && vivo?(h["dias"]) && vivo?(h["etiqueta"])
    d["faq"][1]["a"] = "#{h['dias']}, de #{h['etiqueta']} en jornada continua. " +
      (vivo?(h["cierre"]) ? "#{h['cierre']}." : "")
  end

  d
end

# ── Serialización con el formato del bloque ─────────────────────────────────

# Orden de claves calcado del bloque embebido, para que el diff de git tras
# regenerar sea mínimo y legible.
ORDEN_TOP = %w[telefono direccion categorias cortes spa horario barberia facial equipo flujo resenas faq].freeze
ORDEN_CLAVES = {
  "categorias" => %w[icon titulo texto],
  "cortes" => %w[img icon nombre desc precio dur badge estado],
  "spa" => %w[img icon nombre desc precio dur badge estado],
  "barberia" => %w[nombre desc dur precio badge estado],
  "horario" => %w[dias etiqueta apertura fin cierre nota],
  "equipo" => %w[nombre rol especialidad estado proximo],
  "flujo" => %w[n t d],
  "resenas" => %w[q a m],
  "faq" => %w[q a]
}.freeze

def js_valor(v)
  case v
  when String then '"' + v.gsub(/["\\]/) { |c| "\\" + c } + '"'
  when nil then "null"
  else v.to_s
  end
end

def con_orden(hash, orden)
  orden ||= []
  (orden & hash.keys) + (hash.keys - orden)
end

def objeto_en_linea(h, orden)
  "{ " + con_orden(h, orden).map { |k| "#{k}: #{js_valor(h[k])}" }.join(", ") + " }"
end

def serializar(d)
  partes = con_orden(d, ORDEN_TOP).map do |k|
    v = d[k]
    texto =
      if v.is_a?(Array) && !v.empty? && v.all? { |x| x.is_a?(Hash) }
        "[\n" + v.map { |h| "    " + objeto_en_linea(h, ORDEN_CLAVES[k]) }.join(",\n") + "\n  ]"
      elsif v.is_a?(Hash)
        "{\n" + con_orden(v, ORDEN_CLAVES[k]).map { |ck| "    #{ck}: #{js_valor(v[ck])}" }.join(",\n") + "\n  }"
      elsif v.is_a?(Array)
        "[" + v.map { |x| js_valor(x) }.join(", ") + "]"
      else
        js_valor(v)
      end
    "  #{k}: #{texto}"
  end
  "{\n" + partes.join(",\n") + "\n}"
end

# ── Comparación para --check ────────────────────────────────────────────────

def resumen(v)
  v.nil? ? "(ausente)" : JSON.generate(v)[0, 100]
end

def diferencias(a, b, ruta = "", acc = [])
  return acc if a == b
  if a.is_a?(Hash) && b.is_a?(Hash)
    (a.keys | b.keys).each do |k|
      diferencias(a[k], b[k], ruta.empty? ? k : "#{ruta}.#{k}", acc)
    end
  elsif a.is_a?(Array) && b.is_a?(Array) && a.size == b.size
    a.each_index { |i| diferencias(a[i], b[i], "#{ruta}[#{i}]", acc) }
  else
    acc << "#{ruta}: bloque=#{resumen(a)} ≠ base=#{resumen(b)}"
  end
  acc
end

# ── Programa ────────────────────────────────────────────────────────────────

solo_check = ARGV.include?("--check")

# Codificación explícita: con locale C (CI, cron) el default sería US-ASCII
# y el índice trae tildes y "══" en los marcadores.
html = begin
  File.read(INDICE, encoding: "UTF-8")
rescue Errno::ENOENT
  fallar("no existe #{INDICE}")
end

actual, desde, hasta = extraer_bloque(html)
negocios = obtener("/rest/v1/negocio?select=*&limit=1")
servicios = obtener("/rest/v1/servicios?select=*&order=orden.asc,creado_en.asc")
nuevo = construir(actual, negocios[0], servicios)

if actual == nuevo
  puts "El respaldo embebido coincide con la base."
  exit 0
end

difs = diferencias(actual, nuevo)
if solo_check
  warn "El respaldo embebido está desactualizado respecto a la base (#{difs.size} diferencia#{'s' if difs.size != 1}):"
  difs.first(20).each { |l| warn "  - #{l}" }
  warn "  … y #{difs.size - 20} más" if difs.size > 20
  exit 1
end

File.write(INDICE, html[0...desde] + serializar(nuevo) + ";" + html[hasta..-1], mode: "w:UTF-8")
puts "Bloque window.DATA_911 reescrito en index.html (#{difs.size} diferencia#{'s' if difs.size != 1}):"
difs.first(20).each { |l| puts "  - #{l}" }
