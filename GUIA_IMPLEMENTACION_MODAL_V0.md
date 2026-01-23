# GUÍA DE IMPLEMENTACIÓN - MODAL DE RESULTADOS V0
## Funcionalidades Completas y Pasos de Replicación

---

## 📋 ÍNDICE

1. [Resumen de Funcionalidades](#resumen-de-funcionalidades)
2. [Estructura de Datos](#estructura-de-datos)
3. [Implementación HTML](#implementación-html)
4. [Implementación JavaScript](#implementación-javascript)
5. [Funciones Auxiliares](#funciones-auxiliares)
6. [Exportación a Excel](#exportación-a-excel)
7. [Exportación a PNG](#exportación-a-png)
8. [Adaptación a V1, V2, V3](#adaptación-a-otras-versiones)

---

## 🎯 RESUMEN DE FUNCIONALIDADES

### ✅ Funcionalidades Implementadas en V0

1. **Modal de Resultados con Diseño Burgundy (#800020)**
   - Header con gradiente burgundy
   - Overlay con blur
   - Animación slideUp
   - Responsive (max-width: md)

2. **Sistema de Filtros por Capas**
   - Botones con icono Material + nombre + badge de conteo
   - Filtro activo destacado con borde y color burgundy
   - Scroll horizontal para muchas capas
   - Primera capa seleccionada por defecto

3. **Tablas de Resultados**
   - Filas alternadas (blanco/gris claro)
   - Hover effect (fondo rosa + borde izquierdo burgundy 4px)
   - Formato de números con separador de miles (es-MX)
   - Click en fila para zoom al feature
   - Paginación (50 items por página)

4. **Paginación**
   - Botones Anterior/Siguiente
   - Indicador "Mostrando X-Y de Z resultados"
   - Botones deshabilitados en límites
   - Reset al cambiar de capa

5. **Click-to-Zoom**
   - Centra mapa en el feature clickeado
   - Marker animado de 3 segundos (pulse effect)
   - Cierra modal automáticamente
   - Soporta Point, Polygon, MultiPolygon

6. **Exportación a Excel (.xlsx)**
   - Hoja "00_Info_General" con 16 métricas del KML
   - Hojas individuales por cada capa
   - Headers en burgundy
   - Formato de números con separador de miles
   - Descarga automática con timestamp

7. **Exportación a PNG (.png)**
   - Centra automáticamente el KML completo
   - Incluye leyenda de capas (esquina superior derecha)
   - Cuadro de metadatos (esquina inferior izquierda)
   - Alta resolución (2x scale)
   - Restaura vista original del usuario
   - Descarga automática con timestamp

---

## 📊 ESTRUCTURA DE DATOS

### Variables Globales Necesarias

```javascript
// En la parte superior del archivo .js
let currentAnalysisResults = null;  // Almacena resultados del análisis
let currentModalData = null;         // Datos procesados para el modal
let currentActiveFilter = null;      // Capa actualmente seleccionada
let currentPage = 1;                 // Página actual de paginación
const ITEMS_PER_PAGE = 50;          // Items por página

// Métricas del KML
let kmlMetrics = {
    fileName: '',
    uploadDate: '',
    area: 0,              // km²
    perimeter: 0,         // km
    centroid: null,       // { lat, lng }
    bounds: null,         // { north, south, east, west }
    vertexCount: 0,
    geometryType: ''
};
```

### Estructura de `currentAnalysisResults` (V0)

```javascript
currentAnalysisResults = {
    atlas: [
        { 
            type: 'Feature',
            geometry: { ... },
            properties: { 
                region: 'Huasteca',
                pueblo: 'Nahua',
                // ... más propiedades
            }
        },
        // ... más features
    ],
    regiones: [ ... ],
    lenguas: [ ... ],
    loc_ind: [ ... ],
    ruta: [ ... ],
    localidades: [ ... ],
    puntos: [ ... ]
};
```

### Configuración de Capas (LAYER_CONFIG)

```javascript
const LAYER_CONFIG = {
    atlas: { 
        name: 'Atlas Indígena', 
        color: '#ff00ff', 
        icon: 'temple_buddhist', 
        desc: 'Territorios' 
    },
    regiones: { 
        name: 'Regiones', 
        color: '#ffa500', 
        icon: 'map', 
        desc: 'Influencia' 
    },
    lenguas: { 
        name: 'Lenguas', 
        color: '#00ffff', 
        icon: 'translate', 
        desc: 'Variantes' 
    },
    loc_ind: { 
        name: 'Datos Indígenas', 
        color: '#8000ff', 
        icon: 'groups', 
        desc: 'Contexto Social' 
    },
    ruta: { 
        name: 'Ruta Wixarika', 
        color: '#ff8000', 
        icon: 'alt_route', 
        desc: 'Ruta' 
    },
    localidades: { 
        name: 'Localidades (Pol)', 
        color: '#3b82f6', 
        icon: 'layers', 
        desc: 'Límites' 
    },
    puntos: { 
        name: 'Localidades (Pnt)', 
        color: '#10b981', 
        icon: 'location_on', 
        desc: 'Ubicación' 
    }
};
```

---

## 🎨 IMPLEMENTACIÓN HTML

### 1. Variables CSS (dentro de `<style>` en index0.html)

```css
:root {
    --primary-guinda: #800020;
    --guinda-dark: #600018;
    --guinda-soft: #fdf2f4;
    --guinda-border: #f4cfd7;
}

/* Animación slideUp */
@keyframes slideUp {
    from {
        transform: translateY(100%);
        opacity: 0;
    }
    to {
        transform: translateY(0);
        opacity: 1;
    }
}

.modal-content-results {
    animation: slideUp 0.3s ease-out;
}
```

### 2. HTML del Modal (agregar antes del cierre de `</body>`)

```html
<!-- Modal Overlay de Resultados -->
<div id="resultsModalOverlay" style="position: fixed; inset: 0; background-color: rgba(0, 0, 0, 0.5); backdrop-filter: blur(4px); z-index: 9998; display: none; align-items: center; justify-content: center; padding: 1rem;">
    
    <div class="modal-content-results" style="position: relative; z-index: 20; width: 100%; max-width: 56rem; background: white; border-radius: 2.5rem; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.2); max-height: 90vh; display: flex; flex-direction: column;">
        
        <!-- Header Burgundy -->
        <div style="background: linear-gradient(135deg, var(--primary-guinda) 0%, var(--guinda-dark) 100%); padding: 1.5rem; padding-bottom: 2rem; color: white; flex-shrink: 0;">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div style="display: flex; gap: 1rem; align-items: center;">
                    <div style="width: 3rem; height: 3rem; background: rgba(255, 255, 255, 0.2); border-radius: 0.75rem; display: flex; align-items: center; justify-content: center;">
                        <span class="material-symbols-outlined" style="font-size: 1.5rem;">inventory_2</span>
                    </div>
                    <div>
                        <h1 style="font-size: 1.25rem; font-weight: 800; letter-spacing: 0.05em; margin: 0;">HALLAZGOS</h1>
                        <p id="totalElementsCount" style="color: rgba(255, 255, 255, 0.8); font-size: 0.875rem; font-weight: 500; margin: 0;">0 elementos</p>
                    </div>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button onclick="downloadModalExcel()" style="width: 2.5rem; height: 2.5rem; background: rgba(0, 0, 0, 0.1); border: none; border-radius: 9999px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s;" title="Descargar Excel">
                        <span class="material-symbols-outlined" style="font-size: 1.25rem; color: white;">download</span>
                    </button>
                    <button onclick="closeResultsModal()" style="width: 2.5rem; height: 2.5rem; background: rgba(0, 0, 0, 0.1); border: none; border-radius: 9999px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s;" title="Cerrar">
                        <span class="material-symbols-outlined" style="font-size: 1.25rem; color: white;">close</span>
                    </button>
                </div>
            </div>
        </div>

        <!-- Contenido del Modal -->
        <div style="background: white; margin-top: -1rem; border-top-left-radius: 2rem; border-top-right-radius: 2rem; padding: 1.25rem; padding-top: 1.5rem; padding-bottom: 1.5rem; overflow-y: auto; flex: 1;">
            
            <!-- Filtros de Capas -->
            <div id="layerFilters" style="display: flex; gap: 0.75rem; margin-bottom: 1.5rem; overflow-x: auto; padding-bottom: 0.5rem;">
                <!-- Se generan dinámicamente -->
            </div>

            <!-- Contenedor de Resultados -->
            <div id="layerResultsContainer">
                <!-- Se genera dinámicamente -->
            </div>

            <!-- Botones de Exportación -->
            <div style="margin-top: 1.5rem; display: flex; gap: 0.75rem; flex-wrap: wrap;">
                <button onclick="downloadModalExcel()" style="flex: 1; min-width: 200px; background: linear-gradient(135deg, var(--primary-guinda) 0%, var(--guinda-dark) 100%); color: white; border: none; padding: 0.875rem 1.5rem; border-radius: 0.75rem; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.025em; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 4px 6px -1px rgba(128, 0, 32, 0.3);">
                    <span class="material-symbols-outlined" style="font-size: 1.25rem;">table_chart</span>
                    EXPORTAR A EXCEL
                </button>
                
                <button onclick="exportMapToPNG()" style="flex: 1; min-width: 200px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: white; border: none; padding: 0.875rem 1.5rem; border-radius: 0.75rem; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.025em; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);">
                    <span class="material-symbols-outlined" style="font-size: 1.25rem;">image</span>
                    EXPORTAR MAPA A PNG
                </button>
            </div>
        </div>

        <!-- Indicador de arrastre -->
        <div style="height: 0.5rem; width: 33%; background: #e2e8f0; margin: 0 auto 0.5rem; border-radius: 9999px; opacity: 0.5; flex-shrink: 0;"></div>
    </div>
</div>
```

### 3. Librerías Necesarias (agregar en `<head>`)

```html
<!-- Material Symbols -->
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet">

<!-- Antes del cierre de </body> -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
```

---

## 💻 IMPLEMENTACIÓN JAVASCRIPT

### 1. Funciones Principales del Modal

#### `openResultsModal()`
```javascript
function openResultsModal() {
    const overlay = document.getElementById('resultsModalOverlay');
    if (!overlay) return;
    
    overlay.style.display = 'flex';
    
    // Procesar datos para el modal
    currentModalData = processDataForModal(currentAnalysisResults);
    
    // Renderizar contenido
    renderModalContent();
    
    // Resetear paginación
    currentPage = 1;
}
```

#### `closeResultsModal()`
```javascript
function closeResultsModal() {
    const overlay = document.getElementById('resultsModalOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
    currentActiveFilter = null;
    currentPage = 1;
}
```

#### `processDataForModal(results)`
```javascript
function processDataForModal(results) {
    if (!results) return {};
    
    const processed = {};
    
    Object.keys(results).forEach(layerKey => {
        const features = results[layerKey];
        if (features && features.length > 0) {
            const config = LAYER_CONFIG[layerKey];
            if (config) {
                processed[layerKey] = {
                    title: config.name,
                    icon: config.icon,
                    color: config.color,
                    features: features
                };
            }
        }
    });
    
    return processed;
}
```

#### `renderModalContent()`
```javascript
function renderModalContent() {
    if (!currentModalData) return;
    
    // Contar total de elementos
    const totalElements = Object.values(currentModalData).reduce((sum, layer) => sum + layer.features.length, 0);
    document.getElementById('totalElementsCount').textContent = `${totalElements.toLocaleString('es-MX')} elementos`;
    
    // Renderizar filtros
    renderLayerFilters();
    
    // Mostrar la primera capa por defecto
    const firstLayerKey = Object.keys(currentModalData)[0];
    if (firstLayerKey) {
        currentActiveFilter = firstLayerKey;
        showLayerResults(firstLayerKey);
    }
}
```

### 2. Sistema de Filtros

#### `renderLayerFilters()`
```javascript
function renderLayerFilters() {
    const container = document.getElementById('layerFilters');
    if (!container) return;
    
    container.innerHTML = '';
    
    Object.entries(currentModalData).forEach(([layerKey, layerData]) => {
        const button = document.createElement('button');
        
        const isActive = currentActiveFilter === layerKey;
        
        button.style.cssText = `
            flex-shrink: 0;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.625rem 1rem;
            border-radius: 9999px;
            font-weight: 700;
            font-size: 0.875rem;
            transition: all 0.2s;
            cursor: pointer;
            border: 2px solid ${isActive ? 'rgba(128, 0, 32, 0.2)' : 'transparent'};
            background: ${isActive ? 'rgba(128, 0, 32, 0.1)' : '#f1f5f9'};
            color: ${isActive ? '#800020' : '#64748b'};
        `;
        
        button.innerHTML = `
            <span class="material-symbols-outlined" style="font-size: 1.125rem;">${layerData.icon}</span>
            <span>${layerData.title}</span>
            <span style="background: #e2e8f0; padding: 0.125rem 0.5rem; border-radius: 0.5rem; font-size: 0.75rem;">${layerData.features.length}</span>
        `;
        
        button.addEventListener('click', () => {
            currentActiveFilter = layerKey;
            currentPage = 1; // Reset pagination
            renderLayerFilters();
            showLayerResults(layerKey);
        });
        
        container.appendChild(button);
    });
}
```

### 3. Tablas de Resultados

#### `showLayerResults(layerKey)`
```javascript
function showLayerResults(layerKey) {
    const container = document.getElementById('layerResultsContainer');
    if (!container || !currentModalData[layerKey]) return;
    
    const layerData = currentModalData[layerKey];
    
    // Header de la sección
    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h2 style="color: #1e293b; font-weight: 800; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; margin: 0;">
                ${layerData.title} (${layerData.features.length.toLocaleString('es-MX')})
            </h2>
        </div>
    `;
    
    // Generar tabla
    html += renderTableForLayer(layerKey, layerData);
    
    container.innerHTML = html;
}
```

#### `renderTableForLayer(layerKey, layerData)`
```javascript
function renderTableForLayer(layerKey, layerData) {
    const features = layerData.features;
    if (features.length === 0) {
        return '<p style="color: #94a3b8; font-size: 0.875rem;">No hay datos disponibles.</p>';
    }
    
    // Calcular paginación
    const totalItems = features.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
    const paginatedFeatures = features.slice(startIndex, endIndex);
    
    // Obtener columnas del primer feature
    const firstProps = features[0].properties;
    const columns = Object.keys(firstProps).slice(0, 10); // Máximo 10 columnas
    
    let html = `
        <div style="overflow-x: auto; border-radius: 0.75rem; border: 1px solid #f1f5f9; margin-bottom: 1rem;">
            <table style="width: 100%; text-align: left; font-size: 0.75rem; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f8fafc; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
    `;
    
    // Headers
    columns.forEach(col => {
        html += `<th style="padding: 0.75rem 1rem; white-space: nowrap;">${col}</th>`;
    });
    
    html += `
                    </tr>
                </thead>
                <tbody>
    `;
    
    // Rows
    paginatedFeatures.forEach((feature, index) => {
        const globalIndex = startIndex + index;
        const props = feature.properties;
        const rowBg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
        
        html += `
            <tr onclick="zoomToFeatureFromModal(currentModalData['${layerKey}'].features[${globalIndex}], '${layerKey}')" 
                style="background: ${rowBg}; color: #475569; cursor: pointer; transition: all 0.2s;"
                onmouseover="this.style.background='#fdf2f4'; this.style.borderLeft='4px solid #800020'; this.style.paddingLeft='12px';"
                onmouseout="this.style.background='${rowBg}'; this.style.borderLeft='none'; this.style.paddingLeft='16px';">
        `;
        
        columns.forEach(col => {
            let value = props[col];
            
            // Formatear números
            if (typeof value === 'number') {
                value = value.toLocaleString('es-MX');
            } else if (value === null || value === undefined) {
                value = '-';
            }
            
            html += `<td style="padding: 1rem; white-space: nowrap;">${value}</td>`;
        });
        
        html += `</tr>`;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    // Controles de paginación
    if (totalPages > 1) {
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; padding: 0.5rem 0;">
                <button onclick="changePage(-1)" 
                    ${currentPage === 1 ? 'disabled' : ''}
                    style="padding: 0.5rem 1rem; background: ${currentPage === 1 ? '#f1f5f9' : '#800020'}; color: ${currentPage === 1 ? '#94a3b8' : 'white'}; border: none; border-radius: 0.5rem; font-weight: 600; font-size: 0.75rem; cursor: ${currentPage === 1 ? 'not-allowed' : 'pointer'};">
                    ← Anterior
                </button>
                
                <span style="color: #64748b; font-size: 0.875rem; font-weight: 600;">
                    Mostrando ${(startIndex + 1).toLocaleString('es-MX')}-${endIndex.toLocaleString('es-MX')} de ${totalItems.toLocaleString('es-MX')} resultados (Página ${currentPage} de ${totalPages})
                </span>
                
                <button onclick="changePage(1)" 
                    ${currentPage === totalPages ? 'disabled' : ''}
                    style="padding: 0.5rem 1rem; background: ${currentPage === totalPages ? '#f1f5f9' : '#800020'}; color: ${currentPage === totalPages ? '#94a3b8' : 'white'}; border: none; border-radius: 0.5rem; font-weight: 600; font-size: 0.75rem; cursor: ${currentPage === totalPages ? 'not-allowed' : 'pointer'};">
                    Siguiente →
                </button>
            </div>
        `;
    }
    
    return html;
}
```

#### `changePage(direction)`
```javascript
function changePage(direction) {
    if (!currentActiveFilter || !currentModalData[currentActiveFilter]) return;
    
    const layerData = currentModalData[currentActiveFilter];
    const totalPages = Math.ceil(layerData.features.length / ITEMS_PER_PAGE);
    
    currentPage += direction;
    
    // Limitar entre 1 y totalPages
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;
    
    // Re-renderizar tabla
    showLayerResults(currentActiveFilter);
}
```

### 4. Click-to-Zoom

#### `zoomToFeatureFromModal(feature, layerKey)`
```javascript
function zoomToFeatureFromModal(feature, layerKey) {
    if (!feature || !feature.geometry) {
        showAlert('No se puede centrar en este elemento', 'warning');
        return;
    }
    
    // Cerrar el modal
    closeResultsModal();
    
    // Obtener el centro del feature
    let center;
    if (feature.geometry.type === 'Point') {
        center = L.latLng(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
    } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
        const geoJsonLayer = L.geoJSON(feature);
        center = geoJsonLayer.getBounds().getCenter();
    } else {
        showAlert('Tipo de geometría no soportado', 'warning');
        return;
    }
    
    // Centrar el mapa
    map.setView(center, 14, {
        animate: true,
        duration: 1
    });
    
    // Crear marker temporal animado
    const marker = L.circleMarker(center, {
        radius: 12,
        fillColor: '#800020',
        color: '#fff',
        weight: 3,
        fillOpacity: 0.8
    }).addTo(map);
    
    // Animación pulse
    let pulseCount = 0;
    const pulseInterval = setInterval(() => {
        const radius = 12 + (pulseCount % 2) * 6;
        marker.setRadius(radius);
        pulseCount++;
        
        if (pulseCount > 6) {
            clearInterval(pulseInterval);
            map.removeLayer(marker);
        }
    }, 250);
}
```

---

## 📤 EXPORTACIÓN A EXCEL

### Función `downloadModalExcel()`

```javascript
function downloadModalExcel() {
    if (!currentModalData || Object.keys(currentModalData).length === 0) {
        showAlert('No hay datos para exportar', 'warning');
        return;
    }
    
    try {
        const wb = XLSX.utils.book_new();
        
        // ===== HOJA 1: Info General del KML =====
        const infoData = [
            ['INFORMACIÓN GENERAL DEL ANÁLISIS'],
            [],
            ['Tipo de Análisis', 'Impacto en Áreas de Interés'],
            ['Versión', 'V0 - Versión Básica'],
            ['Nombre del Archivo', kmlMetrics.fileName || 'N/A'],
            ['Fecha de Carga', kmlMetrics.uploadDate || new Date().toLocaleDateString('es-MX')],
            ['Fecha de Exportación', new Date().toLocaleString('es-MX')],
            [],
            ['GEOMETRÍA DEL POLÍGONO'],
            [],
            ['Tipo de Geometría', kmlMetrics.geometryType || 'N/A'],
            ['Área Total (km²)', kmlMetrics.area || 'N/A'],
            ['Perímetro (km)', kmlMetrics.perimeter || 'N/A'],
            ['Número de Vértices', kmlMetrics.vertexCount || 'N/A'],
            ['Centroide (Lat, Lng)', kmlMetrics.centroid ? `${kmlMetrics.centroid.lat.toFixed(6)}, ${kmlMetrics.centroid.lng.toFixed(6)}` : 'N/A'],
            ['Límites Norte', kmlMetrics.bounds?.north?.toFixed(6) || 'N/A'],
            ['Límites Sur', kmlMetrics.bounds?.south?.toFixed(6) || 'N/A'],
            ['Límites Este', kmlMetrics.bounds?.east?.toFixed(6) || 'N/A'],
            ['Límites Oeste', kmlMetrics.bounds?.west?.toFixed(6) || 'N/A'],
            [],
            ['RESUMEN DE CAPAS ANALIZADAS'],
            [],
            ['Total de Capas', Object.keys(currentModalData).length],
            ['Total de Elementos', Object.values(currentModalData).reduce((sum, layer) => sum + layer.features.length, 0)]
        ];
        
        const ws1 = XLSX.utils.aoa_to_sheet(infoData);
        
        // Estilo para el header
        ws1['A1'].s = {
            font: { bold: true, sz: 14, color: { rgb: "800020" } },
            alignment: { horizontal: "center" }
        };
        
        XLSX.utils.book_append_sheet(wb, ws1, '00_Info_General');
        
        // ===== HOJAS 2+: Una hoja por cada capa =====
        Object.entries(currentModalData).forEach(([layerKey, layerData]) => {
            const features = layerData.features;
            if (features.length === 0) return;
            
            // Obtener todas las propiedades únicas
            const allProps = new Set();
            features.forEach(f => {
                Object.keys(f.properties).forEach(prop => allProps.add(prop));
            });
            const columns = Array.from(allProps);
            
            // Crear array de datos
            const sheetData = [columns]; // Headers
            
            features.forEach(feature => {
                const row = columns.map(col => {
                    const value = feature.properties[col];
                    return value !== null && value !== undefined ? value : '';
                });
                sheetData.push(row);
            });
            
            const ws = XLSX.utils.aoa_to_sheet(sheetData);
            
            // Estilo para headers
            columns.forEach((col, index) => {
                const cellAddress = XLSX.utils.encode_cell({ r: 0, c: index });
                if (!ws[cellAddress]) return;
                ws[cellAddress].s = {
                    font: { bold: true, color: { rgb: "FFFFFF" } },
                    fill: { fgColor: { rgb: "800020" } },
                    alignment: { horizontal: "center" }
                };
            });
            
            // Nombre de la hoja (máximo 31 caracteres)
            let sheetName = layerData.title.substring(0, 30);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });
        
        // Descargar archivo
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
        const fileName = `Analisis_Resultados_${dateStr}_${timeStr}.xlsx`;
        
        XLSX.writeFile(wb, fileName);
        showAlert('Archivo Excel descargado exitosamente', 'success');
        
    } catch (error) {
        console.error('Error al generar Excel:', error);
        showAlert('Error al generar el archivo Excel', 'danger');
    }
}
```

---

## 🖼️ EXPORTACIÓN A PNG

### Función `exportMapToPNG()`

```javascript
function exportMapToPNG() {
    showPreloader('Generando imagen del mapa con leyenda...');
    
    try {
        const mapContainer = document.getElementById('map');
        const legend = document.getElementById('mapLegend');
        
        if (!mapContainer) {
            showAlert('No se pudo encontrar el contenedor del mapa', 'danger');
            hidePreloader();
            return;
        }
        
        // Guardar vista actual del usuario
        const originalCenter = map.getCenter();
        const originalZoom = map.getZoom();
        
        // Forzar leyenda visible si hay capas
        const legendWasHidden = legend && legend.classList.contains('hidden');
        if (legend && legendWasHidden && currentModalData && Object.keys(currentModalData).length > 0) {
            legend.classList.remove('hidden');
        }
        
        // Función para capturar el mapa
        const captureMap = () => {
            html2canvas(mapContainer, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
                imageTimeout: 0,
                onclone: function (clonedDoc) {
                    const clonedMap = clonedDoc.getElementById('map');
                    if (clonedMap) {
                        clonedMap.style.width = mapContainer.offsetWidth + 'px';
                        clonedMap.style.height = mapContainer.offsetHeight + 'px';
                    }
                }
            }).then(function (canvas) {
                // Crear canvas compuesto
                const finalCanvas = document.createElement('canvas');
                finalCanvas.width = canvas.width;
                finalCanvas.height = canvas.height;
                const ctx = finalCanvas.getContext('2d');
                
                // Dibujar mapa base
                ctx.drawImage(canvas, 0, 0);
                
                // Dibujar leyenda (si está visible)
                if (legend && !legend.classList.contains('hidden')) {
                    const legendItems = legend.querySelectorAll('.legend-item');
                    if (legendItems.length > 0) {
                        const scale = 2;
                        const legendPadding = 15 * scale;
                        const legendItemHeight = 28 * scale;
                        const legendWidth = 250 * scale;
                        const legendHeight = (legendItems.length * legendItemHeight) + (legendPadding * 2) + (30 * scale);
                        
                        const legendX = canvas.width - legendWidth - (20 * scale);
                        const legendY = 20 * scale;
                        
                        // Fondo de leyenda
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
                        ctx.shadowBlur = 10 * scale;
                        ctx.shadowOffsetY = 2 * scale;
                        ctx.beginPath();
                        ctx.roundRect(legendX, legendY, legendWidth, legendHeight, 12 * scale);
                        ctx.fill();
                        ctx.shadowColor = 'transparent';
                        ctx.shadowBlur = 0;
                        
                        // Título "CAPAS"
                        ctx.fillStyle = '#1e293b';
                        ctx.font = `bold ${14 * scale}px Inter, sans-serif`;
                        ctx.fillText('CAPAS', legendX + legendPadding, legendY + legendPadding + (14 * scale));
                        
                        // Items de leyenda
                        let yOffset = legendY + legendPadding + (35 * scale);
                        legendItems.forEach((item) => {
                            const colorEl = item.querySelector('.legend-color');
                            const labelEl = item.querySelector('.legend-label');
                            const countEl = item.querySelector('.legend-count');
                            
                            if (colorEl && labelEl) {
                                const color = colorEl.style.background || colorEl.style.backgroundColor;
                                const label = labelEl.textContent;
                                const count = countEl ? countEl.textContent : '';
                                
                                // Círculo de color
                                ctx.fillStyle = color;
                                ctx.beginPath();
                                ctx.arc(legendX + legendPadding + (8 * scale), yOffset, 6 * scale, 0, Math.PI * 2);
                                ctx.fill();
                                
                                // Etiqueta
                                ctx.fillStyle = '#475569';
                                ctx.font = `${12 * scale}px Inter, sans-serif`;
                                ctx.fillText(label, legendX + legendPadding + (24 * scale), yOffset + (4 * scale));
                                
                                // Contador
                                if (count) {
                                    ctx.fillStyle = '#94a3b8';
                                    ctx.font = `${11 * scale}px Inter, sans-serif`;
                                    const labelWidth = ctx.measureText(label).width;
                                    ctx.fillText(`(${count})`, legendX + legendPadding + (28 * scale) + labelWidth, yOffset + (4 * scale));
                                }
                                
                                yOffset += legendItemHeight;
                            }
                        });
                    }
                }
                
                // Dibujar cuadro de metadatos
                const scale = 2;
                const metaWidth = 400 * scale;
                const metaHeight = 90 * scale;
                const metaX = 20 * scale;
                const metaY = canvas.height - metaHeight - (20 * scale);
                const metaPadding = 16 * scale;
                
                // Fondo
                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
                ctx.shadowBlur = 10 * scale;
                ctx.shadowOffsetY = 2 * scale;
                ctx.beginPath();
                ctx.roundRect(metaX, metaY, metaWidth, metaHeight, 12 * scale);
                ctx.fill();
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                
                // Título
                ctx.fillStyle = '#800020';
                ctx.font = `bold ${16 * scale}px Inter, sans-serif`;
                ctx.fillText('ANÁLISIS DE IMPACTO - V0', metaX + metaPadding, metaY + metaPadding + (14 * scale));
                
                // Info del archivo
                const now = new Date();
                const dateStr = now.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
                ctx.fillStyle = '#64748b';
                ctx.font = `600 ${12 * scale}px Inter, sans-serif`;
                ctx.fillText(`${kmlMetrics.fileName || 'Polígono de Análisis'} | ${dateStr}`, metaX + metaPadding, metaY + metaPadding + (38 * scale));
                
                // Área y capas
                ctx.fillStyle = '#94a3b8';
                ctx.font = `${11 * scale}px Inter, sans-serif`;
                ctx.fillText(
                    `Área: ${kmlMetrics.area || 'N/A'} km² | ${Object.keys(currentModalData || {}).length} capas analizadas`,
                    metaX + metaPadding,
                    metaY + metaPadding + (62 * scale)
                );
                
                // Descargar
                finalCanvas.toBlob(function (blob) {
                    const now = new Date();
                    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
                    const fileName = `Mapa_Analisis_${dateStr}_${timeStr}.png`;
                    
                    const link = document.createElement('a');
                    link.download = fileName;
                    link.href = URL.createObjectURL(blob);
                    link.click();
                    URL.revokeObjectURL(link.href);
                    
                    // Restaurar vista
                    map.setView(originalCenter, originalZoom, { animate: false });
                    if (legendWasHidden && legend) legend.classList.add('hidden');
                    
                    hidePreloader();
                    showAlert('Mapa exportado con leyenda en alta resolución', 'success');
                }, 'image/png', 1.0);
                
            }).catch(function (error) {
                console.error('Error:', error);
                map.setView(originalCenter, originalZoom, { animate: false });
                if (legendWasHidden && legend) legend.classList.add('hidden');
                hidePreloader();
                showAlert('Error al exportar el mapa', 'danger');
            });
        };
        
        // Centrar KML antes de capturar
        if (kmlLayer && kmlLayer.getBounds) {
            const bounds = kmlLayer.getBounds();
            if (bounds && bounds.isValid()) {
                const onMoveEnd = () => {
                    map.off('moveend', onMoveEnd);
                    setTimeout(captureMap, 800);
                };
                map.once('moveend', onMoveEnd);
                map.fitBounds(bounds, { padding: [50, 50], animate: false });
            } else {
                setTimeout(captureMap, 800);
            }
        } else {
            setTimeout(captureMap, 800);
        }
        
    } catch (error) {
        console.error('Error:', error);
        hidePreloader();
        showAlert('Error al exportar el mapa', 'danger');
    }
}
```

---

## 🔄 ADAPTACIÓN A V1, V2, V3

### Diferencias entre Versiones

| Aspecto | V0 | V1 | V2 | V3 |
|---------|----|----|----|----|
| **Capas** | 7 | 3 | 15 | 17 + Multi-KML |
| **Estructura de Datos** | `currentAnalysisResults` | `layersData` | `layersData` | `kmlLayers` Map |
| **Análisis** | Automático | Manual por capa | Multicapa completo | Multi-KML avanzado |
| **Complejidad** | Básica | Media | Alta | Muy Alta |

### Pasos para Adaptar a V1

1. **Cambiar fuente de datos:**
   ```javascript
   // V0 usa:
   currentAnalysisResults = { atlas: [...], regiones: [...] }
   
   // V1 usa:
   layersData = {
       localidades: { layer: L.geoJSON(...), features: [...] },
       localities_points: { layer: L.geoJSON(...), features: [...] },
       loc_indigenas_datos: { layer: L.geoJSON(...), features: [...] }
   }
   ```

2. **Actualizar `processDataForModal()`:**
   ```javascript
   function processDataForModal(layersData) {
       const processed = {};
       
       Object.entries(layersData).forEach(([key, data]) => {
           if (data.features && data.features.length > 0) {
               const config = LAYER_CONFIG[key];
               if (config) {
                   processed[key] = {
                       title: config.name,
                       icon: config.icon,
                       color: config.color,
                       features: data.features
                   };
               }
           }
       });
       
       return processed;
   }
   ```

3. **Actualizar LAYER_CONFIG** para V1:
   ```javascript
   const LAYER_CONFIG = {
       localidades: { 
           name: 'Localidades', 
           color: '#3b82f6', 
           icon: 'location_city', 
           desc: 'Polígonos' 
       },
       localities_points: { 
           name: 'Puntos de Localidades', 
           color: '#10b981', 
           icon: 'place', 
           desc: 'Puntos' 
       },
       loc_indigenas_datos: { 
           name: 'Datos Indígenas', 
           color: '#8b5cf6', 
           icon: 'groups', 
           desc: 'Población' 
       }
   };
   ```

4. **Llamar al modal** después del análisis:
   ```javascript
   // En V1, después de ejecutar el análisis manual
   function executeManualAnalysis() {
       // ... código de análisis ...
       
       // Al finalizar:
       currentModalData = processDataForModal(layersData);
       openResultsModal();
   }
   ```

### Pasos para Adaptar a V2

Similar a V1, pero con 15 capas. Agregar scroll vertical en filtros si es necesario:

```javascript
// En renderLayerFilters(), si hay muchas capas:
container.style.maxHeight = '200px';
container.style.overflowY = 'auto';
```

### Pasos para Adaptar a V3 (Multi-KML)

1. **Selector de KML activo:**
   ```javascript
   let activeKmlId = null; // ID del KML activo
   
   function processDataForModal(kmlId) {
       const kmlData = kmlLayers.get(kmlId);
       if (!kmlData) return {};
       
       return processLayersData(kmlData.layersData);
   }
   ```

2. **Botón para cambiar KML:**
   ```html
   <select id="kmlSelector" onchange="changeActiveKML(this.value)">
       <!-- Opciones dinámicas -->
   </select>
   ```

3. **Modo combinado (todos los KMLs):**
   ```javascript
   function processAllKMLsData() {
       const combined = {};
       
       kmlLayers.forEach((kmlData, kmlId) => {
           Object.entries(kmlData.layersData).forEach(([layerKey, data]) => {
               if (!combined[layerKey]) {
                   combined[layerKey] = { features: [] };
               }
               combined[layerKey].features.push(...data.features);
           });
       });
       
       return processLayersData(combined);
   }
   ```

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### Para V1, V2, V3:

- [ ] Copiar HTML del modal a index1.html / index2.html / index3.html
- [ ] Copiar variables CSS (:root) y @keyframes
- [ ] Agregar librerías necesarias (Material Symbols, XLSX, html2canvas)
- [ ] Copiar todas las funciones JavaScript
- [ ] Actualizar LAYER_CONFIG según la versión
- [ ] Modificar `processDataForModal()` según estructura de datos
- [ ] Actualizar llamadas a `openResultsModal()` en los botones de análisis
- [ ] Adaptar `exportMapToPNG()` cambiando "V0" por "V1", "V2", "V3"
- [ ] Probar paginación con datasets grandes
- [ ] Verificar exportación Excel con todas las capas
- [ ] Validar exportación PNG con leyenda

---

## 📝 NOTAS IMPORTANTES

1. **Rendimiento:** Para más de 10,000 elementos, considerar virtualización de tabla
2. **Colores:** Mantener consistencia con color burgundy #800020 en todas las versiones
3. **Responsive:** El modal funciona bien en pantallas desde 768px en adelante
4. **Navegadores:** Probado en Chrome, Firefox, Edge (últimas versiones)
5. **Limitaciones PNG:** html2canvas puede tener problemas con algunos estilos CSS avanzados

---

## 🔗 REFERENCIAS

- [XLSX.js Documentation](https://docs.sheetjs.com/)
- [html2canvas Documentation](https://html2canvas.hertzen.com/)
- [Leaflet API Reference](https://leafletjs.com/reference.html)
- [Material Symbols Guide](https://fonts.google.com/icons)

---

**Documento creado:** 19 de enero de 2026  
**Versión:** 1.0  
**Autor:** GitHub Copilot  
**Proyecto:** Geovisualizador de Áreas de Interés - Modal de Resultados
