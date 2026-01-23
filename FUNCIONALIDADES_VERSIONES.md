# Funcionalidades por Versión - Sistema de Análisis Geoespacial

## 📊 RESUMEN COMPARATIVO

| Característica | V0 | V1 | V2 | V3 |
|----------------|----|----|----|----|
| **Nombre** | Básico Indígena | Localidades + Indígenas | Multicapa Completo | Multi-KML Comparativo |
| **Capas** | 7 | 3 | 15 | 17 |
| **KMLs simultáneos** | 1 | 1 | 1 | 10 |
| **Lazy Loading** | ❌ | ✅ | ✅ | ✅ |
| **PDF Report** | ❌ | ❌ | ✅ | ❌ |
| **Modo Comparativo** | ❌ | ❌ | ❌ | ✅ |
| **Modal Guinda** | ✅ | ⏳ | ⏳ | ⏳ |
| **Variable de datos** | `currentAnalysisResults` | `layersData` | `layersData` | `kmlLayers.get(id).analysis` |

### Prioridad de Implementación:
1. ✅ **V0** - Completado (modal + Excel + hover + click)
2. 🔄 **V1** - Siguiente (3 capas, más simple)
3. 🔄 **V2** - Después (15 capas, estructura similar a V1)
4. 🔄 **V3** - Final (Multi-KML requiere lógica especial)

---

## VERSIÓN 0 (index0.html / index0.js)
**Análisis Básico con Capas Indígenas**

### Capas Disponibles:
1. **Atlas Indígena** (`atlas`)
   - Territorios indígenas
   - Color: Magenta (#ff00ff)
   - Icono: temple_buddhist

2. **Regiones** (`regiones`)
   - Regiones de influencia
   - Color: Naranja (#ffa500)
   - Icono: map

3. **Lenguas** (`lenguas`)
   - Variantes lingüísticas
   - Color: Cian (#00ffff)
   - Icono: translate

4. **Datos Indígenas** (`loc_ind`)
   - Contexto social y demográfico
   - Color: Morado (#8000ff)
   - Icono: groups

5. **Ruta Wixarika** (`ruta`)
   - Ruta ceremonial
   - Color: Naranja oscuro (#ff8000)
   - Icono: alt_route

6. **Localidades (Polígonos)** (`localidades`)
   - Límites administrativos
   - Color: Azul (#3b82f6)
   - Icono: layers

7. **Localidades (Puntos)** (`puntos`)
   - Ubicaciones puntuales
   - Color: Verde (#10b981)
   - Icono: location_on

### Funcionalidades:
- ✅ Dibujo de polígonos de consulta con KML
- ✅ Análisis de intersección con todas las capas
- ✅ Modal de resultados con diseño guinda (#800020)
- ✅ Filtros por capa con conteo de elementos
- ✅ Tablas con striped rows (filas alternadas)
- ✅ Hover effect en filas de tabla (rosa + borde guinda)
- ✅ Click en fila para centrar mapa en elemento
- ✅ Animación de marker temporal (3 segundos)
- ✅ Formato de números con separador de miles
- ✅ Descarga a Excel con hojas por capa
- ✅ Scroll horizontal en tabs de capas

### Validación de Polígonos:
```javascript
// V0 valida con currentAnalysisResults
if (!currentAnalysisResults) {
    showAlert('No hay resultados disponibles', 'warning');
    return;
}
```

---

## VERSIÓN 1 (index1.html / index1.js)
**Análisis de Localidades con Datos Indígenas**

### Capas Disponibles:
1. **Localidades** (`localidades`)
   - Polígonos de localidades de México
   - URL: `Gabvy_localidades_4326.geojson`
   - Color: TBD
   - Icono: layers

2. **Localidades Puntos** (`localities_points`)
   - Coordenadas de localidades sin polígono
   - URL: `Gabvy_localidades_puntos.geojson`
   - Color: TBD
   - Icono: location_on

3. **Datos Indígenas** (`loc_indigenas_datos`)
   - Datos contextuales indígenas
   - URL: `Gabvy_loc_indigenas_datos.geojson`
   - Color: TBD
   - Icono: groups

### Características Especiales:
- Sistema de **Lazy Loading** (carga bajo demanda)
- Cache de datos con `dataCache.Map()`
- Métricas de KML extendidas (densidad de población, superposiciones)

### Variables de Estado:
```javascript
let localitiesData = null;
let localitiesPointsData = null;
let clippedLocalitiesLayer = null;
let clippedPointsLayer = null;
let layersData = {};
```

### Funcionalidades a Implementar:
- ⏳ Modal de resultados estilo guinda
- ⏳ Tablas con striped y hover
- ⏳ Click para centrar mapa
- ⏳ Descarga a Excel

### Validación de Polígonos:
```javascript
// V1 valida con layersData
if (!layersData || Object.keys(layersData).length === 0) {
    showAlert('No hay resultados disponibles', 'warning');
    return;
}
```

---

## VERSIÓN 2 (index2.html / index2.js)
**Análisis Multicapa Completo**

### Capas Disponibles (15 capas):
1. **Localidades** (`localidades`) - Color: TBD, Icono: layers
2. **Localidades Puntos** (`localities_points`) - Color: TBD, Icono: location_on
3. **Atlas Pueblos Indígenas** (`atlas`) - Color: TBD, Icono: temple_buddhist
4. **Municipios** (`municipios`) - Color: TBD, Icono: map
5. **Regiones Indígenas** (`regiones`) - Color: TBD, Icono: public
6. **RAN** (`ran`) - Color: TBD, Icono: agriculture
7. **Lenguas Indígenas** (`lenguas`) - Color: TBD, Icono: translate
8. **ZA Público** (`za_publico`) - Color: TBD, Icono: park
9. **ZA Público A** (`za_publico_a`) - Color: TBD, Icono: park
10. **ANP Estatales** (`anp_estatal`) - Color: TBD, Icono: nature
11. **Ramsar** (`ramsar`) - Color: TBD, Icono: water
12. **Sitios Arqueológicos** (`sitio_arqueologico`) - Color: TBD, Icono: archaeology
13. **Zonas Históricas** (`z_historicos`) - Color: TBD, Icono: account_balance
14. **Loc Indígenas Datos** (`loc_indigenas_datos`) - Color: TBD, Icono: groups
15. **Ruta Wixarika** (`rutaWixarika`) - Color: TBD, Icono: alt_route

### Características Especiales:
- **15 capas** de análisis simultáneo
- Sistema de **Lazy Loading** con `dataCache`
- Métricas ampliadas: intersecciones con ANP, Ramsar, Zonas Históricas, ZA
- 3 capas base MapTiler (Calles, Satélite, Terreno)
- Control de capas Leaflet
- Generación de reportes PDF

### Variables de Estado:
```javascript
let clippedLocalitiesLayer, clippedLocalitiesPointsLayer, clippedAtlasLayer,
    clippedMunicipiosLayer, clippedRegionesLayer, clippedRanLayer,
    clippedLenguasLayer, clippedZaPublicoLayer, clippedZaPublicoALayer,
    clippedAnpEstatalLayer, clippedRamsarLayer, clippedSitioArqueologicoLayer,
    clippedZHistoricosLayer, clippedLocIndigenasLayer, clippedRutaWixarikaLayer;
let layersData = {};
let dataCache = {};
```

### Funcionalidades a Implementar:
- ⏳ Modal de resultados estilo guinda
- ⏳ Tablas con striped y hover
- ⏳ Click para centrar mapa
- ⏳ Descarga a Excel (ya tiene Excel Report)

### Validación de Polígonos:
```javascript
// V2 valida con layersData
if (!layersData || Object.keys(layersData).length === 0) {
    showAlert('No hay resultados disponibles', 'warning');
    return;
}
```

---

## VERSIÓN 3 (index3.html / index3.js)
**Análisis Multi-KML (Comparativo)**

### Capas Disponibles (15+ capas):
1. **Localidades** (`localidades`) - Color: #008000, Icono: layers
2. **Localidades Puntos** (`localidades_puntos`) - Color: #FF00FF, Icono: location_on
3. **Atlas Pueblos Indígenas** (`atlas`) - Color: #ff00ff, Icono: temple_buddhist
4. **Municipios** (`municipios`) - Color: TBD, Icono: map
5. **Regiones Indígenas** (`regiones`) - Color: TBD, Icono: public
6. **RAN** (`ran`) - Color: TBD, Icono: agriculture
7. **RAN Sin Geometría** (`ranNoGeomData`) - Datos tabulares con lookup
8. **Lenguas Indígenas** (`lenguas`) - Color: TBD, Icono: translate
9. **ZA Público** (`za_publico`) - Color: TBD, Icono: park
10. **ZA Público A** (`za_publico_a`) - Color: TBD, Icono: park
11. **ANP Estatales** (`anp_estatal`) - Color: TBD, Icono: nature
12. **Ramsar** (`ramsar`) - Color: TBD, Icono: water
13. **Sitios Arqueológicos** (`sitio_arqueologico`) - Color: TBD, Icono: archaeology
14. **Zonas Históricas** (`z_historicos`) - Color: TBD, Icono: account_balance
15. **Loc Indígenas Datos** (`loc_indigenas_datos`) - Color: TBD, Icono: groups
16. **Ruta Wixarika** (`rutaWixarika`) - Color: TBD, Icono: alt_route
17. **Localidades Datos** (`localidadesDatosData`) - Datos tabulares adicionales

### Características ÚNICAS:
- ✨ **Multi-KML**: Permite cargar hasta 10 KMLs simultáneamente
- ✨ **Comparación**: Análisis combinado de múltiples áreas
- ✨ **Colores automáticos**: 10 colores predefinidos para KMLs
- ✨ **Selector de KML activo**: Navegación entre análisis
- ✨ **Modo combinado**: Resultados agregados de todos los KMLs
- Sistema de lookup para RAN con datos tabulares
- Corrección automática de encoding (mojibake)
- Popup builder global: `window.createPopupContent()`

### Variables de Estado Especiales:
```javascript
let kmlLayers = new Map();  // Mapa de todos los KMLs cargados
let kmlCounter = 0;         // Contador de KMLs
let activeKmlId = null;     // KML actualmente activo
let combinedAnalysis = null; // Análisis combinado
let combinedMode = false;   // Modo de vista combinada

const kmlColors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

// Variables de capas (17 capas)
let clippedLocalitiesLayer, clippedAtlasLayer, clippedMunicipiosLayer,
    clippedRegionesLayer, clippedRanLayer, clippedLenguasLayer,
    clippedZaPublicoLayer, clippedZaPublicoALayer, clippedAnpEstatalLayer,
    clippedRamsarLayer, clippedSitioArqueologicoLayer, clippedZHistoricosLayer,
    clippedLocIndigenasLayer, clippedRutaWixarikaLayer, clippedLocalitiesPointsLayer;
```

### Funcionalidades a Implementar:
- ⏳ Modal de resultados estilo guinda (con soporte Multi-KML)
- ⏳ Selector de KML en modal
- ⏳ Tablas con striped y hover
- ⏳ Click para centrar mapa
- ⏳ Descarga a Excel (individual y combinado)
- ⏳ Modo combinado en modal

### Validación de Polígonos:
```javascript
// V3 valida con kmlLayers Map
if (!activeKmlId || !kmlLayers.has(activeKmlId)) {
    showAlert('No hay KML activo', 'warning');
    return;
}

const kmlData = kmlLayers.get(activeKmlId);
if (!kmlData.analysis || Object.keys(kmlData.analysis).length === 0) {
    showAlert('No hay resultados para este KML', 'warning');
    return;
}
```

---

## Componentes Compartidos

### Modal de Resultados (Estándar Guinda)
- **Header**: Gradiente guinda (#800020 → #600018)
- **Contador total**: Formato con separador de miles
- **Filtros de capas**: Pills con icono + nombre + badge de conteo
- **Tablas**: 
  - 5 columnas máximo
  - 50 registros visibles
  - Striped: blanco/gris alternado
  - Hover: rosa claro + borde izquierdo guinda
  - Click: centra mapa + marker temporal
- **Descarga Excel**: Hojas separadas por capa

### Estilos CSS Requeridos
```css
:root {
    --primary-guinda: #800020;
    --guinda-soft: #fdf2f4;
    --guinda-border: #f4cfd7;
}
```

### Funciones JavaScript Base
1. `openResultsModal()` - Abre modal y procesa datos
2. `closeResultsModal()` - Cierra modal
3. `processDataForModal()` - Convierte datos a formato modal
4. `renderModalContent()` - Renderiza contenido completo
5. `renderLayerFilters()` - Genera tabs de filtros
6. `showLayerResults()` - Muestra resultados de capa
7. `renderTableForLayer()` - Genera tabla HTML
8. `downloadModalExcel()` - Descarga Excel con XLSX.js
9. `zoomToFeatureFromModal()` - Centra mapa en feature

---

## Plan de Implementación

### Paso 1: Análisis de Versiones
- [ ] Revisar index1.js - identificar capas y estructura de datos
- [ ] Revisar index2.js - identificar capas y estructura de datos
- [ ] Revisar index3.js - identificar capas y estructura de datos
- [ ] Documentar iconos y colores por versión

### Paso 2: Adaptación del Modal
- [ ] V1: Copiar funciones del modal desde V0
- [ ] V1: Ajustar `processDataForModal()` según estructura
- [ ] V1: Probar y validar
- [ ] V2: Repetir proceso
- [ ] V3: Repetir proceso

### Paso 3: Validación Final
- [ ] Probar descarga Excel en todas las versiones
- [ ] Validar hover y click en todas las tablas
- [ ] Verificar formato de números
- [ ] Probar centrado de mapa en cada versión

---

## Notas Técnicas

### Dependencias
- **Leaflet**: Mapa base
- **XLSX.js**: Generación de archivos Excel
- **Material Symbols Outlined**: Iconos
- **Tailwind CSS** (con prefijo tw- en algunas versiones)

### Estructura de Datos Esperada
```javascript
// Formato V0 (currentAnalysisResults)
{
    atlas: [feature1, feature2, ...],
    regiones: [feature1, feature2, ...],
    lenguas: [...],
    // etc
}

// Cada feature tiene:
{
    geometry: { type: "Point|Polygon", coordinates: [...] },
    properties: { campo1: valor1, campo2: valor2, ... }
}
```

### Consideraciones
- Los nombres de capas pueden variar entre versiones
- La estructura `layersData` vs `currentAnalysisResults` puede cambiar
- Algunos layers pueden tener `.features` como array, otros directamente el array
- Validar siempre que existan datos antes de abrir el modal
