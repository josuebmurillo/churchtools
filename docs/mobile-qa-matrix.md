# Mobile QA Matrix (Frontend)

Fecha: 2026-03-03

## Breakpoints auditados
- 360x800
- 390x844
- 768x1024
- 1024x1366

## Estado por módulo

### Global Layout
- ✅ Sidebar sticky y scrollable en móvil.
- ✅ Sidebar de navegación convertido a menú hamburguesa desplegable en <=960px (Admin/Music/Voluntarios).
- ✅ Botones de header en grid responsive (2 columnas → 1 columna en pantallas muy pequeñas).
- ✅ Paneles/cards con padding y radios reducidos en <=600px.

### Tablas (Generic/Data)
- ✅ Contenedor con scroll horizontal táctil (`module-table`).
- ✅ Estructura interna estable (`module-table__inner`) para evitar cortes de columnas.
- ✅ Filas/headers conservan legibilidad sin romper desktop.

### Music
- ✅ Setlist/focus/media en 1 columna en móvil.
- ✅ Mixer con transporte adaptativo (2 columnas en móvil, 1 columna en pantallas muy pequeñas).
- ✅ Rejilla de stems adaptativa (2 columnas y luego 1).
- ✅ Faders y VU optimizados para altura móvil.

### Calendar
- ✅ Modo móvil con scroll horizontal controlado en calendario mensual.
- ✅ Celdas con altura reducida en pantallas pequeñas para mejor densidad.

### Volunteers / Admin
- ✅ Formularios inline en una columna para móvil.
- ✅ `row-actions` full-width en móvil para mejor tap target.
- ✅ Tablas largas sin overflow roto.
- ✅ Dashboards de métricas/seguimiento en Admin ajustados a grilla móvil (sin cards recortadas).

## Riesgos/observaciones restantes (no bloqueantes)
- ✅ `module-panel--map` y overlays flotantes migrados a `dvh` (con fallback), mitigando saltos por barra dinámica en móviles.
- ✅ PDF embebidos ajustados a alturas dinámicas (`dvh`) con mínimo más razonable en móvil.
- ✅ Rejillas/listados de métricas con truncado en móvil para textos largos (360px).
- ⚠️ Recomendable validar en dispositivos iOS/Android reales para confirmar comportamiento de Safari/Chrome con barra dinámica y teclado abierto.

## Recomendaciones próximas
1. Prueba manual en dispositivos reales iOS/Android para overlays de mapa/PDF.
2. Añadir `line-clamp` opcional en títulos largos de cards de métricas y biblioteca.
3. Definir check de regresión visual por breakpoint en cada release (capturas base por módulo).

## Criterio de cierre propuesto
Se considera "mobile-ready v1" cuando:
- No hay overflow horizontal accidental fuera de tablas/calendar.
- Todos los CTA principales son tocables (>40px de alto visual).
- Flujo Music (ensayo/setlist/biblioteca) es operable completo en 390x844 sin zoom.
