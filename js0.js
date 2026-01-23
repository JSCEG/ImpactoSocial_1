/**
 * GEOVISUALIZADOR DE ÁREAS DE INTERÉS - VERSIÓN 0 (BÁSICA INDÍGENA)
 * ====================================================================
 */
// --- GLOBALS ---
let map, kmlLayer, kmlGeoJson, bufferLayer;
let analysisMode = 'manual';
let clipType = 'direct';
let clippedLayers = {};
let currentAnalysisResults = null;

// Métricas del polígono KML
let kmlMetrics = {
    fileName: '',
    uploadDate: '',
    area: 0,
    perimeter: 0,
    centroid: null,
    bounds: null,
    vertexCount: 0,
    geometryType: ''
};

// URLs de datos (V0 Básica)
const urls = {
    localidades: 'https://cdn.sassoapps.com/Gabvy/localidades_4326.geojson',
    localities_points: 'https://cdn.sassoapps.com/Gabvy/localidades_puntos.geojson',
    atlas: 'https://cdn.sassoapps.com/Gabvy/atlaspueblosindigenas.geojson',
    regiones: 'https://cdn.sassoapps.com/Gabvy/regionesindigenas.geojson',
    lenguas: 'https://cdn.sassoapps.com/Gabvy/lenguasindigenas_corregido.geojson',
    loc_indigenas_datos: 'https://cdn.sassoapps.com/Gabvy/loc_indigenas_datos.geojson',
    rutaWixarika: 'https://cdn.sassoapps.com/Gabvy/rutaWixarika.geojson'
};

const dataCache = new Map();

// Configuración de visualización para las capas básicas
const LAYER_CONFIG = {
    // Base
    localidades: { name: 'Localidades (Pol)', color: '#3b82f6', icon: 'layers', desc: 'Límites Urbanos' },
    puntos: { name: 'Localidades (Pnt)', color: '#10b981', icon: 'location_on', desc: 'Puntos Rurales' },

    // Indígena
    atlas: { name: 'Atlas Indígena', color: '#ff00ff', icon: 'temple_buddhist', desc: 'Territorios' },
    regiones: { name: 'Regiones Indígenas', color: '#ffa500', icon: 'public', desc: 'Regiones INPI' },
    lenguas: { name: 'Lenguas Indígenas', color: '#00ffff', icon: 'translate', desc: 'Hablantes' },
    loc_ind: { name: 'Datos Indígenas', color: '#8000ff', icon: 'groups', desc: 'Población Indígena' },
    ruta: { name: 'Ruta Wixarika', color: '#ff8000', icon: 'alt_route', desc: 'Sitios Sagrados' }
};

// Helper para Toasts visuales
function showAlert(message, type = 'info') {
    const container = document.getElementById('toastContainer') || document.body;
    const toast = document.createElement('div');
    toast.className = `alert alert-${type} tw-fixed tw-bottom-20 tw-left-1/2 tw-transform -tw-translate-x-1/2 tw-z-[9999] tw-shadow-2xl tw-border-0 tw-rounded-2xl tw-flex tw-items-center tw-gap-3 tw-animate-bounce tw-px-6 tw-py-3 tw-bg-white tw-border tw-border-gray-100`;

    // Colores según tipo
    if (type === 'success') toast.classList.add('tw-text-green-600');
    else if (type === 'danger') toast.classList.add('tw-text-red-600');
    else toast.classList.add('tw-text-blue-600');

    const icon = type === 'success' ? 'check_circle' : (type === 'danger' ? 'error' : 'info');
    toast.innerHTML = `<span class="material-symbols-outlined">${icon}</span>
                       <span class="tw-text-xs tw-font-bold">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('tw-animate-bounce');
        toast.style.opacity = '0';
        toast.style.transition = 'all 0.5s ease';
        setTimeout(() => toast.remove(), 500);
    }, 3500);
}

// Helpers para Preloader
function showPreloader(status = 'Iniciando...') {
    const p = document.getElementById('preloader');
    const s = document.getElementById('preloaderStatus');
    const b = document.getElementById('preloaderBar');

    if (p) p.classList.add('active');
    if (s) s.textContent = status;
    if (b) b.style.width = '5%';

    document.body.style.cursor = 'wait';
    const btn = document.getElementById('uploadKmlBtn');
    if (btn) btn.disabled = true;
}

function updatePreloader(status, progress) {
    const s = document.getElementById('preloaderStatus');
    const b = document.getElementById('preloaderBar');
    if (s) s.textContent = status;
    if (b) b.style.width = `${progress}%`;
}

function hidePreloader() {
    const p = document.getElementById('preloader');
    if (p) p.classList.remove('active');
    document.body.style.cursor = 'default';
    const btn = document.getElementById('uploadKmlBtn');
    if (btn) btn.disabled = false;
}

/**
 * Formatea propiedades para popup
 */
function formatPopupAllProperties(title, props) {
    let html = `<div class="tw-p-1"><div class="tw-text-[10px] tw-font-black tw-text-primary tw-uppercase tw-border-b tw-border-gray-100 tw-pb-1 tw-mb-2">${title}</div>`;
    html += `<div class="tw-max-h-[160px] tw-overflow-y-auto"><table class="tw-w-full tw-text-[9px]">`;
    for (const [key, value] of Object.entries(props)) {
        if (value !== null && value !== undefined && value !== '' && typeof value !== 'object') {
            html += `<tr class="tw-border-b tw-border-gray-50"><td class="tw-font-bold tw-text-gray-400 tw-py-1 tw-pr-2">${key}</td><td class="tw-text-gray-700 tw-py-1">${value}</td></tr>`;
        }
    }
    html += `</table></div></div>`;
    return html;
}

async function getLayerData(layerKey) {
    if (dataCache.has(layerKey)) return dataCache.get(layerKey);
    const url = urls[layerKey];
    if (!url) return { type: 'FeatureCollection', features: [] };

    const proxies = [
        (u) => u,
        (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
        (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`
    ];

    for (let i = 0; i < proxies.length; i++) {
        try {
            const fetchUrl = proxies[i](url);
            console.log(`[Carga] Intento ${i + 1} para ${layerKey}...`);
            const r = await fetch(fetchUrl);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);

            let data;
            if (i === 1) {
                const pjson = await r.json();
                data = JSON.parse(pjson.contents);
            } else {
                data = await r.json();
            }

            if (data && data.features) {
                console.log(`[Carga] ✓ ${layerKey} cargada con éxito`);
                dataCache.set(layerKey, data);
                return data;
            }
        } catch (err) {
            console.warn(`[Carga] ✗ Fallo intento ${i + 1} para ${layerKey}:`, err.message);
        }
    }

    console.error(`[Carga] !!! ${layerKey} falló tras todos los intentos.`);
    return { type: 'FeatureCollection', features: [] };
}

function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    if (map) { map.remove(); map = null; }

    const baseMaps = {
        'SENER Oscuro': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 18 }),
        'SENER Light': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 18 }),
        'Google Satellite': L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 20 })
    };

    map = L.map('map', {
        center: [24.1, -102],
        zoom: 5,
        minZoom: 4,
        layers: [baseMaps['SENER Light']],
        zoomControl: false,
        attributionControl: false
    });

    window.baseMaps = baseMaps;
}

// Visualización de Buffer
window.updateBufferVisualization = function () {
    if (!kmlGeoJson || !map) return;

    const T = window.turf;
    if (!T) return;

    if (bufferLayer) {
        map.removeLayer(bufferLayer);
        bufferLayer = null;
    }

    try {
        const clipTypeSelect = document.getElementById('clipTypeSelect');
        const type = clipTypeSelect ? clipTypeSelect.value : 'direct';
        const originalFeature = kmlGeoJson.features[0];

        const bufferedFeature = applyClipBuffer(originalFeature, type);

        if (type !== 'exact' && bufferedFeature !== originalFeature) {
            bufferLayer = L.geoJSON(bufferedFeature, {
                style: {
                    color: '#3b82f6',
                    weight: 3,
                    fillOpacity: 0.12,
                    fillColor: '#60a5fa',
                    dashArray: '8, 8'
                }
            }).addTo(map);
            if (bufferLayer && kmlLayer) bufferLayer.bringToBack();
        }
    } catch (error) {
        console.error('[Buffer] Error:', error);
    }
};

function applyClipBuffer(feature, type) {
    const T = window.turf;
    if (!T || !feature) return feature;
    try {
        if (type === 'direct') return T.buffer(feature, 2, { units: 'kilometers' });
        if (type === 'indirect') return T.buffer(feature, 5, { units: 'kilometers' });
        if (type === 'custom') {
            const kms = parseFloat(document.getElementById('customBufferInput')?.value || 1);
            return T.buffer(feature, kms, { units: 'kilometers' });
        }
        return feature;
    } catch (e) { return feature; }
}

// === LÓGICA DE ANÁLISIS V0 (BÁSICA INDÍGENA) ===
async function performClipping() {
    console.log('[ANÁLISIS V0] INICIANDO');
    if (!kmlGeoJson) { showAlert('Primero carga un archivo KML', 'info'); return; }

    showPreloader('Preparando análisis V0...');
    await new Promise(r => setTimeout(r, 100));

    try {
        const clipTypeSelect = document.getElementById('clipTypeSelect');
        clipType = clipTypeSelect ? clipTypeSelect.value : 'direct';
        const originalArea = kmlGeoJson.features[0];
        const clipArea = applyClipBuffer(originalArea, clipType);

        // Limpiar capas previas
        Object.values(clippedLayers).forEach(l => { if (l && map) map.removeLayer(l); });
        clippedLayers = {};
        currentAnalysisResults = {};

        // Estilos
        const stylePoint = (color) => ({
            pointToLayer: (f, latlng) => L.circleMarker(latlng, {
                radius: 6, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9, className: 'premium-marker'
            })
        });
        const stylePoly = (color) => ({ style: { color, weight: 2, fillOpacity: 0.3 } });

        const isChecked = (id) => document.querySelector(`input[value="${id}"]`)?.checked;

        // Definición de tareas para las capas V0
        const tasks = [
            // Base
            { id: 'localidades', type: 'poly', key: 'localidades', urlKey: 'localidades' },
            { id: 'puntos', type: 'point', key: 'puntos', urlKey: 'localities_points' },
            // Indígena
            { id: 'atlas', type: 'point', key: 'atlas', urlKey: 'atlas' },
            { id: 'regiones', type: 'poly', key: 'regiones', urlKey: 'regiones' },
            { id: 'lenguas', type: 'point', key: 'lenguas', urlKey: 'lenguas' },
            { id: 'loc_ind', type: 'point', key: 'loc_ind', urlKey: 'loc_indigenas_datos' },
            { id: 'ruta', type: 'poly', key: 'ruta', urlKey: 'rutaWixarika' }
        ];

        // Validar selección
        const selectedTasks = tasks.filter(t => isChecked(t.id));
        if (selectedTasks.length === 0) {
            showAlert('Selecciona al menos una capa', 'warning');
            hidePreloader();
            return;
        }

        // Ejecutar tareas secuencialmente
        for (let i = 0; i < selectedTasks.length; i++) {
            const task = selectedTasks[i];
            const config = LAYER_CONFIG[task.id] || { name: task.id, color: '#000' };

            updatePreloader(`PROCESANDO: ${config.name.toUpperCase()}`, Math.round(((i + 1) / selectedTasks.length) * 100));

            try {
                const data = await getLayerData(task.urlKey);
                if (data && data.features.length > 0) {
                    const style = task.type === 'point' ? stylePoint(config.color) : stylePoly(config.color);
                    const r = clipLayer(data, style, (p) => formatPopupAllProperties(config.name, p), clipArea);

                    if (r.clipped.length > 0) {
                        const layer = r.layer.addTo(map);
                        clippedLayers[task.key] = layer;
                        currentAnalysisResults[task.key] = r.clipped;
                    }
                }
            } catch (err) {
                console.error(`Error procesando capa ${task.id}:`, err);
            }
        }

        updateLateralControl();
        updateLegend();
        updateResultsBadge();

        const totalHits = Object.values(currentAnalysisResults).reduce((sum, list) => sum + list.length, 0);
        if (totalHits > 0) {
            showAlert(`Análisis completado: ${totalHits} hallazgos.`, 'success');
            // Mostrar botón flotante
            document.getElementById('floatingResultsBtn').classList.remove('tw-hidden');
            document.getElementById('floatingResultsBtn').classList.add('tw-flex');
        } else {
            showAlert('El análisis no arrojó resultados en el área seleccionada.', 'info');
        }

    } catch (e) {
        console.error(e);
        showAlert('Error crítico durante el análisis', 'danger');
    } finally {
        hidePreloader();
    }
}

function clipLayer(data, styleOptions, popupFormatter, clipArea) {
    const T = window.turf;
    if (!T || !clipArea || !data.features) return { clipped: [], layer: L.layerGroup() };

    // Optimización: bbox check primero
    const clipBbox = T.bbox(clipArea);
    const clipPoly = T.bboxPolygon(clipBbox);

    const clipped = data.features.filter(f => {
        try {
            // Check rápido de bbox
            if (!T.booleanIntersects(f, clipPoly)) return false;
            // Check preciso
            return T.booleanIntersects(f.geometry, clipArea.geometry);
        } catch (_) { return false; }
    });

    const layer = L.geoJSON(T.featureCollection(clipped), styleOptions);
    if (popupFormatter) layer.eachLayer(l => l.bindPopup(popupFormatter(l.feature.properties)));

    return { clipped, layer };
}

// === UI UPDATES ===

function updateLateralControl() {
    const ctrl = document.getElementById('lateralLayerControl');
    if (!ctrl) return;
    ctrl.innerHTML = '';
    let hasContent = false;

    Object.keys(clippedLayers).forEach(key => {
        const layer = clippedLayers[key];
        const config = LAYER_CONFIG[key];
        const count = layer.getLayers().length;

        const btn = document.createElement('div');
        btn.className = 'tw-w-8 tw-h-8 tw-rounded-full tw-flex tw-items-center tw-justify-center tw-cursor-pointer tw-transition-transform hover:tw-scale-110 tw-border tw-border-gray-200';
        btn.style.backgroundColor = map.hasLayer(layer) ? config.color : '#f3f4f6';
        btn.style.color = map.hasLayer(layer) ? 'white' : '#9ca3af';
        btn.title = `${config.name} (${count})`;
        btn.innerHTML = `<span class="material-symbols-outlined tw-text-sm">${config.icon}</span>`;

        btn.onclick = () => {
            if (map.hasLayer(layer)) {
                map.removeLayer(layer);
                btn.style.backgroundColor = '#f3f4f6';
                btn.style.color = '#9ca3af';
            } else {
                layer.addTo(map);
                btn.style.backgroundColor = config.color;
                btn.style.color = 'white';
            }
        };

        ctrl.appendChild(btn);
        hasContent = true;
    });

    if (hasContent) ctrl.classList.remove('tw-hidden');
    else ctrl.classList.add('tw-hidden');
}

function updateResultsBadge() {
    const badge = document.getElementById('resultsBadgeCount');
    if (!badge || !currentAnalysisResults) return;
    const total = Object.values(currentAnalysisResults).reduce((sum, list) => sum + list.length, 0);
    badge.textContent = total;
}

window.updateLegend = function () {
    const legendEl = document.getElementById('mapLegend');
    const itemsContainer = document.getElementById('legendItems');
    if (!legendEl || !itemsContainer) return;

    itemsContainer.innerHTML = '';
    let visibleCount = 0;

    Object.keys(clippedLayers).forEach(key => {
        const layer = clippedLayers[key];
        if (map.hasLayer(layer)) {
            const config = LAYER_CONFIG[key];
            const count = layer.getLayers().length;
            visibleCount++;

            const item = document.createElement('div');
            item.className = 'tw-flex tw-items-center tw-justify-between tw-mb-1';
            item.innerHTML = `
                <div class="tw-flex tw-items-center tw-gap-2">
                    <div class="tw-w-3 tw-h-3 tw-rounded-full" style="background-color: ${config.color}"></div>
                    <span class="tw-text-[10px] tw-font-bold tw-text-gray-600">${config.name}</span>
                </div>
                <span class="tw-text-[10px] tw-font-bold tw-bg-gray-100 tw-text-gray-500 tw-px-1.5 tw-rounded">${count}</span>
            `;
            itemsContainer.appendChild(item);
        }
    });

    if (visibleCount > 0) {
        legendEl.classList.remove('tw-hidden');
    } else {
        legendEl.classList.add('tw-hidden');
    }
}

// === MODAL & REPORTING ===

function openResultsModal() {
    if (!currentAnalysisResults) return;
    const modal = document.getElementById('resultsModal');
    modal.classList.add('active');
    renderModalContent(processDataForModal(currentAnalysisResults));
}

function closeResultsModal() {
    document.getElementById('resultsModal').classList.remove('active');
}

function processDataForModal(data) {
    const processed = {};
    Object.entries(data).forEach(([key, features]) => {
        if (features.length > 0) {
            processed[key] = {
                title: LAYER_CONFIG[key]?.name || key,
                icon: LAYER_CONFIG[key]?.icon || 'layers',
                features: features,
                key: key
            };
        }
    });
    return processed;
}

let currentActiveFilter = null;
let currentPage = 1;
const ITEMS_PER_PAGE = 50;

function renderModalContent(data) {
    const total = Object.values(data).reduce((s, l) => s + l.features.length, 0);
    document.getElementById('totalElementsCount').textContent = `${total.toLocaleString('es-MX')} REGISTROS ENCONTRADOS`;

    if (!currentActiveFilter && Object.keys(data).length > 0) {
        currentActiveFilter = Object.keys(data)[0];
    }

    renderLayerFilters(data);
    if (currentActiveFilter && data[currentActiveFilter]) {
        showLayerResults(currentActiveFilter, data[currentActiveFilter]);
    }
}

function renderLayerFilters(data) {
    const container = document.getElementById('layerFilters');
    container.innerHTML = '';

    Object.entries(data).forEach(([key, info]) => {
        const btn = document.createElement('button');
        const isActive = currentActiveFilter === key;

        btn.className = `tw-w-full tw-text-left tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-rounded-lg tw-mb-1 tw-transition-colors ${isActive ? 'tw-bg-primary/10 tw-text-primary' : 'hover:tw-bg-gray-100 tw-text-gray-500'}`;
        btn.innerHTML = `
            <div class="tw-flex tw-items-center tw-gap-2">
                <span class="material-symbols-outlined tw-text-sm">${info.icon}</span>
                <span class="tw-text-[10px] tw-font-bold tw-uppercase">${info.title}</span>
            </div>
            <span class="tw-text-[10px] tw-font-bold ${isActive ? 'tw-bg-primary tw-text-white' : 'tw-bg-gray-200 tw-text-gray-600'} tw-px-1.5 tw-rounded-md">${info.features.length}</span>
        `;

        btn.onclick = () => {
            currentActiveFilter = key;
            currentPage = 1;
            renderLayerFilters(data);
            showLayerResults(key, info);
        };
        container.appendChild(btn);
    });
}

function showLayerResults(key, info) {
    const container = document.getElementById('layerResultsContainer');
    const features = info.features;

    if (features.length === 0) {
        container.innerHTML = '<div class="tw-text-center tw-text-gray-400">Sin datos</div>';
        return;
    }

    // Paginación
    const totalPages = Math.ceil(features.length / ITEMS_PER_PAGE);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const pagedFeatures = features.slice(start, start + ITEMS_PER_PAGE);

    // Tabla
    const firstProps = pagedFeatures[0].properties;
    const headers = Object.keys(firstProps).slice(0, 5); // Primeras 5 columnas

    let html = `
        <div class="tw-flex tw-items-center tw-justify-between tw-mb-4">
            <h3 class="tw-text-xs tw-font-black tw-text-primary tw-uppercase">${info.title} (${features.length})</h3>
            <button onclick="window.zoomToLayer('${key}')" class="tw-text-[10px] tw-font-bold tw-text-primary hover:tw-underline">Ver Todos en Mapa</button>
        </div>
        <div class="tw-overflow-x-auto tw-rounded-lg tw-border tw-border-gray-100">
            <table class="tw-w-full tw-text-left">
                <thead class="tw-bg-gray-50">
                    <tr>
                        ${headers.map(h => `<th class="tw-px-4 tw-py-2 tw-text-[9px] tw-font-black tw-text-gray-400 tw-uppercase">${h}</th>`).join('')}
                    </tr>
                </thead>
                <tbody class="tw-divide-y tw-divide-gray-50">
                    ${pagedFeatures.map(f => `
                        <tr class="hover:tw-bg-gray-50 tw-cursor-pointer" onclick='zoomToFeature(${JSON.stringify(f.geometry)}, ${JSON.stringify(f.properties)})'>
                            ${headers.map(h => `<td class="tw-px-4 tw-py-2 tw-text-[10px] tw-text-gray-600">${f.properties[h] || '-'}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    // Controles Paginación
    if (totalPages > 1) {
        html += `
            <div class="tw-flex tw-items-center tw-justify-center tw-gap-2 tw-mt-4">
                <button ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(-1)" class="tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-rounded-lg tw-bg-gray-100 disabled:tw-opacity-50 hover:tw-bg-primary hover:tw-text-white tw-transition-colors">
                    <span class="material-symbols-outlined tw-text-sm">chevron_left</span>
                </button>
                <span class="tw-text-[10px] tw-font-bold tw-text-gray-500">Pág ${currentPage} de ${totalPages}</span>
                <button ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(1)" class="tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-rounded-lg tw-bg-gray-100 disabled:tw-opacity-50 hover:tw-bg-primary hover:tw-text-white tw-transition-colors">
                    <span class="material-symbols-outlined tw-text-sm">chevron_right</span>
                </button>
            </div>
        `;
    }

    container.innerHTML = html;
}

window.changePage = function (delta) {
    currentPage += delta;
    const info = processDataForModal(currentAnalysisResults)[currentActiveFilter];
    showLayerResults(currentActiveFilter, info);
}

window.zoomToFeature = function (geometry, properties) {
    if (!geometry) return;

    if (window.highlightLayer) {
        map.removeLayer(window.highlightLayer);
        window.highlightLayer = null;
    }
    if (window.highlightTimer) {
        clearTimeout(window.highlightTimer);
        window.highlightTimer = null;
    }

    const layer = L.geoJSON(geometry);
    const bounds = layer.getBounds();

    if (geometry.type === 'Point') {
        const latlng = L.latLng(geometry.coordinates[1], geometry.coordinates[0]);
        map.setView(latlng, 16);

        window.highlightLayer = L.circleMarker(latlng, {
            radius: 10,
            color: '#800020',
            fillColor: '#800020',
            fillOpacity: 0.5,
            className: 'pulse-animation'
        }).addTo(map);

        const props = properties || {};
        const nameKeys = ['VARIANTE', 'variante', 'LOCALIDAD', 'NOMGEO', 'nombre', 'Nombre', 'NAME', 'Name', 'nom_loc', 'NOM_LOC', 'municipio', 'MUNICIPIO', 'etiqueta', 'label'];
        let name = 'Elemento Seleccionado';

        for (const key of nameKeys) {
            if (props[key]) {
                name = props[key];
                break;
            }
        }

        if (name === 'Elemento Seleccionado') {
            const firstKey = Object.keys(props).find(k => typeof props[k] === 'string' && !k.toLowerCase().includes('id') && props[k].length > 2);
            if (firstKey) name = props[firstKey];
        }

        L.popup({
            closeButton: false,
            className: 'custom-popup-guinda',
            autoPan: false,
            offset: [0, -10]
        })
            .setLatLng(latlng)
            .setContent(`<div class="tw-text-center tw-font-black tw-text-primary tw-text-xs tw-uppercase tw-px-2 tw-py-1">${name}</div>`)
            .openOn(map);

    } else {
        map.fitBounds(bounds, { padding: [100, 100], animate: true, duration: 1.5 });

        window.highlightLayer = L.geoJSON(geometry, {
            style: {
                color: '#800020',
                weight: 4,
                fillOpacity: 0.1,
                className: 'pulse-animation'
            }
        }).addTo(map);

        const center = bounds.getCenter();
        const props = properties || {};
        const nameKeys = ['VARIANTE', 'variante', 'LOCALIDAD', 'NOMGEO', 'nombre', 'Nombre', 'NAME', 'Name', 'nom_loc', 'NOM_LOC', 'municipio', 'MUNICIPIO', 'etiqueta', 'label'];
        let name = 'Elemento Seleccionado';

        for (const key of nameKeys) {
            if (props[key]) {
                name = props[key];
                break;
            }
        }

        if (name === 'Elemento Seleccionado') {
            const firstKey = Object.keys(props).find(k => typeof props[k] === 'string' && !k.toLowerCase().includes('id') && props[k].length > 2);
            if (firstKey) name = props[firstKey];
        }

        L.popup({
            closeButton: false,
            className: 'custom-popup-guinda',
            autoPan: false
        })
            .setLatLng(center)
            .setContent(`<div class="tw-text-center tw-font-black tw-text-primary tw-text-xs tw-uppercase tw-px-2 tw-py-1">${name}</div>`)
            .openOn(map);
    }
    closeResultsModal();

    window.highlightTimer = setTimeout(() => {
        if (window.highlightLayer) {
            map.removeLayer(window.highlightLayer);
            window.highlightLayer = null;
            map.closePopup();
        }
    }, 5000);
}

window.zoomToLayer = function (key) {
    const layer = clippedLayers[key];
    if (layer) {
        map.fitBounds(layer.getBounds(), { padding: [50, 50] });
        closeResultsModal();
    }
}

window.downloadModalExcel = function () {
    if (!currentAnalysisResults) return;

    const wb = XLSX.utils.book_new();

    // Hoja Resumen
    const summary = [['CAPA', 'CANTIDAD']];
    Object.entries(currentAnalysisResults).forEach(([key, list]) => {
        summary.push([LAYER_CONFIG[key].name, list.length]);
    });
    const wsSummary = XLSX.utils.aoa_to_sheet(summary);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'RESUMEN');

    // Hojas por Capa
    Object.entries(currentAnalysisResults).forEach(([key, list]) => {
        if (list.length > 0) {
            const rows = list.map(f => f.properties);
            const ws = XLSX.utils.json_to_sheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, LAYER_CONFIG[key].name.substring(0, 30));
        }
    });

    XLSX.writeFile(wb, `Analisis_V0_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

window.exportMapToPNG = function () {
    if (!currentAnalysisResults) {
        showAlert('Primero realiza un análisis para exportar.', 'warning');
        return;
    }

    closeResultsModal();

    setTimeout(() => {
        showPreloader('Generando imagen del mapa...');

        const mapContainer = document.getElementById('map');
        const legend = document.getElementById('mapLegend');

        const wasLegendHidden = legend.classList.contains('tw-hidden');
        if (wasLegendHidden) legend.classList.remove('tw-hidden');

        html2canvas(mapContainer, {
            useCORS: true,
            allowTaint: true,
            scale: 2,
            backgroundColor: '#ffffff',
            ignoreElements: (element) => {
                return element.classList.contains('leaflet-control-zoom') ||
                    element.id === 'openControl' ||
                    element.id === 'floatingResultsBtn';
            }
        }).then(canvas => {
            if (wasLegendHidden) legend.classList.add('tw-hidden');

            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = canvas.width;
            finalCanvas.height = canvas.height;
            const ctx = finalCanvas.getContext('2d');

            ctx.drawImage(canvas, 0, 0);

            const scale = 2;
            const padding = 20 * scale;
            const boxWidth = 400 * scale;
            const boxHeight = 100 * scale;
            const x = 20 * scale;
            const y = finalCanvas.height - boxHeight - (20 * scale);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
            ctx.shadowBlur = 10 * scale;
            ctx.beginPath();
            ctx.roundRect(x, y, boxWidth, boxHeight, 10 * scale);
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.fillStyle = '#800020';
            ctx.font = `bold ${16 * scale}px Montserrat, sans-serif`;
            ctx.fillText('ANÁLISIS GEOESPACIAL V0', x + padding, y + (30 * scale));

            ctx.fillStyle = '#4b5563';
            ctx.font = `bold ${12 * scale}px Inter, sans-serif`;
            ctx.fillText(`ARCHIVO: ${kmlMetrics.fileName || 'N/A'}`, x + padding, y + (55 * scale));

            const dateStr = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
            ctx.font = `${10 * scale}px Inter, sans-serif`;
            ctx.fillText(`FECHA: ${dateStr} | ÁREA: ${kmlMetrics.area} km²`, x + padding, y + (75 * scale));

            if (!wasLegendHidden) {
                const legendX = finalCanvas.width - (220 * scale);
                const legendY = finalCanvas.height - (20 * scale);

                const items = [];
                Object.keys(clippedLayers).forEach(key => {
                    if (map.hasLayer(clippedLayers[key])) {
                        const config = LAYER_CONFIG[key];
                        const count = clippedLayers[key].getLayers().length;
                        items.push({ name: config.name, color: config.color, count: count });
                    }
                });

                if (items.length > 0) {
                    const itemHeight = 25 * scale;
                    const legendHeight = (items.length * itemHeight) + (40 * scale);
                    const currentY = finalCanvas.height - legendHeight - (20 * scale);

                    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
                    ctx.shadowBlur = 8 * scale;
                    ctx.beginPath();
                    ctx.roundRect(legendX, currentY, 200 * scale, legendHeight, 10 * scale);
                    ctx.fill();
                    ctx.shadowBlur = 0;

                    ctx.fillStyle = '#9ca3af';
                    ctx.font = `bold ${10 * scale}px Montserrat, sans-serif`;
                    ctx.fillText('SIMBOLOGÍA', legendX + (15 * scale), currentY + (25 * scale));

                    items.forEach((item, index) => {
                        const itemY = currentY + (45 * scale) + (index * itemHeight);

                        ctx.beginPath();
                        ctx.arc(legendX + (25 * scale), itemY - (4 * scale), 6 * scale, 0, 2 * Math.PI);
                        ctx.fillStyle = item.color;
                        ctx.fill();

                        ctx.fillStyle = '#4b5563';
                        ctx.font = `bold ${11 * scale}px Inter, sans-serif`;
                        ctx.fillText(item.name, legendX + (40 * scale), itemY);

                        const countText = item.count.toString();
                        const countWidth = ctx.measureText(countText).width + (10 * scale);

                        ctx.fillStyle = '#f3f4f6';
                        ctx.beginPath();
                        ctx.roundRect(legendX + (200 * scale) - countWidth - (15 * scale), itemY - (10 * scale), countWidth, 14 * scale, 4 * scale);
                        ctx.fill();

                        ctx.fillStyle = '#6b7280';
                        ctx.font = `bold ${9 * scale}px Inter, sans-serif`;
                        ctx.fillText(countText, legendX + (200 * scale) - countWidth - (10 * scale), itemY);
                    });
                }
            }

            const link = document.createElement('a');
            link.download = `Mapa_Analisis_V0_${new Date().getTime()}.png`;
            link.href = finalCanvas.toDataURL('image/png');
            link.click();

            hidePreloader();
            showAlert('Mapa exportado exitosamente', 'success');

            setTimeout(() => openResultsModal(), 500);

        }).catch(err => {
            console.error(err);
            hidePreloader();
            showAlert('Error al exportar imagen', 'danger');
            setTimeout(() => openResultsModal(), 500);
        });
    }, 300);
}

// === INICIALIZACIÓN ===
function initApp() {
    initMap();

    const kInput = document.getElementById('kmlFile');
    if (kInput) {
        kInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById('fileNameLabel').textContent = file.name;
                processKmlFile(file);
            }
        });
    }

    map.on('click', () => {
        if (window.highlightLayer) {
            map.removeLayer(window.highlightLayer);
            window.highlightLayer = null;
            map.closePopup();
        }
    });

    document.getElementById('uploadKmlBtn').addEventListener('click', performClipping);

    document.getElementById('clearMap').addEventListener('click', () => {
        window.location.reload();
    });

    // Event listener para el selector de tipo de clip
    const clipSelect = document.getElementById('clipTypeSelect');
    if (clipSelect) {
        clipSelect.addEventListener('change', (e) => {
            const customContainer = document.getElementById('customBufferContainer');
            if (e.target.value === 'custom') {
                customContainer.classList.remove('tw-hidden');
            } else {
                customContainer.classList.add('tw-hidden');
            }
            window.updateBufferVisualization();
        });
    }

    // Event listener para el input de buffer personalizado
    const customInput = document.getElementById('customBufferInput');
    if (customInput) {
        customInput.addEventListener('input', window.updateBufferVisualization);
    }
}

function processKmlFile(file) {
    Object.values(clippedLayers).forEach(l => { if (l && map) map.removeLayer(l); });
    clippedLayers = {};
    currentAnalysisResults = null;

    updateLateralControl();
    updateLegend();
    updateResultsBadge();

    const resBtn = document.getElementById('floatingResultsBtn');
    if (resBtn) resBtn.classList.add('tw-hidden');

    if (window.highlightLayer) {
        map.removeLayer(window.highlightLayer);
        window.highlightLayer = null;
    }

    showPreloader('Analizando estructura KML...');
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const kmlDom = new DOMParser().parseFromString(e.target.result, 'text/xml');
            const gj = toGeoJSON.kml(kmlDom);
            const polys = gj.features.filter(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');

            if (polys.length === 0) throw new Error('No se encontraron polígonos en el KML');

            kmlGeoJson = { type: 'FeatureCollection', features: [polys[0]] };

            if (kmlLayer) map.removeLayer(kmlLayer);
            kmlLayer = L.geoJSON(kmlGeoJson, { style: { color: '#B8860B', weight: 4, fillOpacity: 0.1 } }).addTo(map);
            map.fitBounds(kmlLayer.getBounds(), { padding: [50, 50] });

            kmlMetrics.fileName = file.name;
            kmlMetrics.area = (window.turf.area(polys[0]) / 1000000).toFixed(2);

            updateBufferVisualization();
            showAlert(`KML Cargado: ${kmlMetrics.area} km²`, 'success');

        } catch (err) {
            showAlert('Error procesando KML: ' + err.message, 'danger');
            console.error(err);
        } finally {
            hidePreloader();
        }
    };
    reader.readAsText(file);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}