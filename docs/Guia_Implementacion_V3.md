# Geovisualizador Multi-Área (V3) — Guía de Implementación y Presentación

Esta guía explica, paso a paso y con ejemplos, cómo funciona la Versión 3 (Multi-Área) del Geovisualizador. Está pensada para equipos que no han trabajado con mapas o geoprocesamiento en el navegador. Incluye el "por qué" y el "para qué" de cada parte.

---

## 1. ¿Qué resuelve este proyecto?

- Permite cargar hasta 10 áreas de interés (archivos KML) y analizar cómo intersectan con múltiples capas temáticas (localidades, ANP, Ramsar, etc.).
- Todo corre en el navegador: no se suben archivos a servidores y la información del usuario no se almacena.
- Entrega resultados visuales (mapa, listas, gráficos) y reportes (PDF; Excel en V2, replicable en V3).

¿Por qué en el cliente?
- Privacidad: el KML del usuario no sale de su computadora.
- Simplicidad de despliegue: es un sitio estático (HTML+CSS+JS).
- Velocidad de iteración: cambios front terminan en una actualización de archivos.

---

## 2. Tecnologías y librerías (y para qué se usan)

- Leaflet: renderiza el mapa, agrega capas/overlays, maneja interacciones.
- MapTiler SDK + plugin Leaflet (con fallback OSM): mapas base modernos.
- Turf.js: geoprocesamiento (buffer, intersect, área, densidades, overlaps).
- togeojson: convierte archivos KML a GeoJSON para poder operar en JS.
- Bootstrap 5 + Bootstrap Icons: UI responsiva y accesible.
- html2canvas + jsPDF: generación de reportes PDF con mapas y gráficos.
- Simple-DataTables: tablas ordenables (cuando se usa).

Todos estos recursos se cargan desde CDNs o archivos locales referenciados en `index3.html`.

---

## 3. Anatomía de la vista (index3.html)

Estructura general:
- Navbar institucional (Selector, V1, V2, V3) — navegación homogénea.
- Título + instrucciones (onboarding) justo debajo del navbar.
- Columna izquierda (controles): acordeón con 4 pasos.
- Columna derecha: mapa Leaflet.
- Footer institucional.

Fragmento clave (navbar + título + instrucciones):
```html
<nav class="navbar navbar-expand-lg navbar-dark bg-primary shadow-sm">
  <!-- Logos e items de nav -->
</nav>
<div class="container-fluid mt-3">
  <h4>Geovisualizador — Versión 3 <span class="badge bg-primary">V3</span></h4>
  <small class="text-muted">Multi-Área</small>
</div>
<div class="container-fluid mt-2">
  <div class="alert alert-info">1) Sube hasta 10 KMLs... 4) Descarga reportes</div>
</div>
```

Carga controlada de dependencias (evita caché obsoleta):
```html
<script>
  window.APP_VERSION = 'YYYYMMDD-3';
  (function () {
    function withV(url) { return url + (url.includes('?')?'&':'?') + 'v=' + APP_VERSION; }
    function loadCss(href){ var l=document.createElement('link'); l.rel='stylesheet'; l.href=withV(href); document.head.appendChild(l); }
    function loadScript(src, cb){ var s=document.createElement('script'); s.src=withV(src); s.onload=()=>cb&&cb(); document.head.appendChild(s); }
    function whenLeafletReady(cb, tries){ tries=tries||100; (function wait(){ if (window.L && L.map) return cb(); if(--tries<=0) return cb(); setTimeout(wait,120); })(); }
    loadCss('style.css');
    whenLeafletReady(()=> loadScript('togeojson.js', ()=> loadScript('index3.js')));
  })();
</script>
```

---

## 4. Flujo de datos (index3.js): del KML al análisis

1) Cargar KML(s):
- El usuario selecciona hasta 10 archivos KML.
- `togeojson` convierte KML → GeoJSON.
- Si hay varios polígonos, se unifican en un MultiPolygon para un clipping consistente.

2) Preparar el área para análisis:
- Tipo de área:
  - Exacta: usa el polígono tal cual.
  - Núcleo: aplica un buffer dinámico con Turf (en kilómetros) alrededor del polígono.

Ejemplo de buffer con Turf:
```js
const buffered = turf.buffer(geom, bufferKm, { units: 'kilometers' });
```

3) Cruce con capas temáticas:
- Cada capa (GeoJSON) se recorre y se filtra por intersección:
```js
const inside = turf.booleanIntersects(feature, areaGeom);
if (inside) clipped.push(feature);
```
- Resultado: por cada KML/área se generan "clipped layers" por tema (sólo lo que cae dentro del área).

4) Localidades: polígono + puntos 100 m (fall-back)
- Si existe polígono de localidad: se usa ese.
- Si una localidad sólo tiene coordenada (punto): se genera un círculo de 100 m para contabilizarla.
- Se deduplica por CVEGEO para evitar doble conteo (punto + polígono).

5) Métricas y KPIs
- Área y perímetro de la geometría final (exacta o núcleo).
- Densidad de localidades (loc/km²) y población intersectada si viene en atributos.
- Flags de intersección (ANP, Ramsar, Zonas Históricas, Zonas Arqueológicas) cuando hay al menos 1 cruce.

---

## 5. Visualización en el mapa

- Leaflet muestra cada "clipped layer" con un estilo por tema y la capa del área (polígono/buffer).
- Control de capas (Layers Control) para activar/desactivar visibilidad de overlays.
- Lista de áreas cargadas: seleccionar un área centra el mapa y actualiza resultados.

Código típico de capa GeoJSON:
```js
const layer = L.geoJSON(geojson, {
  style: f => ({ color: '#7C1946', weight: 1, fillOpacity: 0.2 })
}).addTo(map);
```

---

## 6. Reportes (PDF) y exportables

- PDF (V3):
  - Se arma con jsPDF y se capturan vistas (mapa, gráficos) con html2canvas.
  - Páginas: portada, índice, resumen ejecutivo, secciones por capa, mapa con leyenda.

Ejemplo: captura de gráfico y agregado a PDF
```js
const canvas = await html2canvas(document.getElementById('layerChart'), { scale: 2 });
pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 25, 60, 160, 75);
```

- Excel (implementado en V2 y replicable en V3):
  - Hoja "Resumen" por capa.
  - Hoja "Lenguas (conteo)": agrupación única por nombre de lengua sin repeticiones.

---

## 7. UX y accesibilidad

- Bootstrap 5: acordeones, modales, alerts.
- Tooltips en campos con título; botón "volver arriba".
- Panel de controles "sticky" en desktop para no perder el panel al scrollear.
- Paleta institucional y responsive (mobile-first) en `style.css`.

---

## 8. Rendimiento y buenas prácticas

- KMLs grandes: considerar simplificación previa.
- Buffer grande = más costo computacional.
- Activar sólo las capas necesarias en el mapa para mantener fluidez.
- APP_VERSION para invalidar caché cuando se publican cambios.

---

## 9. Despliegue y requisitos

- Es un sitio estático (HTML, CSS, JS):
  - Servidor web simple, S3, GitHub Pages, etc.
- CORS: si se consumen GeoJSON externos, habilitar CORS o servir en el mismo dominio.
- Navegadores: Firefox es más permisivo en pruebas locales; Chrome/Edge requieren servir por HTTP(s).

---

## 10. Glosario técnico mínimo

- KML: formato de archivo para datos geoespaciales (Google Earth).
- GeoJSON: formato JSON para geometrías (puntos, líneas, polígonos).
- Buffer: zona alrededor de una geometría a una distancia dada.
- Intersección: cuando dos geometrías comparten área o tocan.
- MultiPolygon: una geometría con múltiples polígonos.

---

## 11. Preguntas frecuentes (FAQ)

- ¿Se suben mis archivos al servidor?
  - No. Se procesan en el navegador y no se almacenan datos del usuario.

- ¿Qué pasa si cargo un KML con varios polígonos?
  - Se combinan en un MultiPolygon y se usa como área única para análisis.

- ¿Por qué a veces el mapa en PDF usa otra base?
  - Para garantizar una captura consistente con html2canvas; luego se restaura la base original.

- ¿Puedo exportar Excel en V3?
  - Sí, replicando el patrón de V2: XLSX + FileSaver con hojas "Resumen" y "Lenguas (conteo)".

---

## 12. Ruta rápida para estudiar antes de presentar

1) Practica el flujo: carga 1-2 KML, elige Exacta vs Núcleo, corre análisis, mira capas y genera reporte.
2) Revisa las funciones de Turf que usamos: `buffer`, `booleanIntersects`, `intersect`, `area`.
3) Entiende el manejo de localidades (polígono + punto 100 m con dedupe por CVEGEO).
4) Repasa el loader con `APP_VERSION` para explicar caché.
5) Ten a mano la lista de librerías y su propósito.

---

Si necesitas que agreguemos las mismas hojas de Excel en V3 (Resumen + Lenguas por conteo), las integramos con el mismo enfoque que V2 sin tocar la lógica principal.
