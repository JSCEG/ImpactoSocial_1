/**
 * GEOVISUALIZADOR DE ÁREAS DE INTERÉS - VERSIÓN 3 (MULTI-KML COMPARATIVO)
 * =======================================================================
 * Basado en la arquitectura V2 pero escalado para soportar múltiples geometrías simultáneas.
 */

// --- GLOBALS MULTI-KML ---
let map;
let kmlLayers = new Map(); // Almacena { id: { geojson, layer, bufferLayer, metrics, analysis: {}, color } }
let activeKmlId = null;    // ID del KML actualmente seleccionado para visualizar/analizar
let kmlCounter = 0;        // Contador para IDs únicos

// Paleta de colores para KMLs (distintos para cada archivo subido)
const kmlColors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

// URLs de datos (15 capas)
const urls = {
    atlas: 'https://cdn.sassoapps.com/Gabvy/atlaspueblosindigenas.geojson',
    municipios: 'https://cdn.sassoapps.com/Gabvy/municipios_4326.geojson',
    regiones: 'https://cdn.sassoapps.com/Gabvy/regionesindigenas.geojson',
    ran: 'https://cdn.sassoapps.com/Gabvy/RAN_4326.geojson',
    lenguas: 'https://cdn.sassoapps.com/Gabvy/lenguasindigenas_corregido.geojson',
    za_publico: 'https://cdn.sassoapps.com/Gabvy/ZA_publico.geojson',
    za_publico_a: 'https://cdn.sassoapps.com/Gabvy/ZA_publico_a.geojson',
    anp_estatal: 'https://cdn.sassoapps.com/Gabvy/anp_estatal.geojson',
    ramsar: 'https://cdn.sassoapps.com/Gabvy/ramsar.geojson',
    sitio_arqueologico: 'https://cdn.sassoapps.com/Gabvy/sitio_arqueologico.geojson',
    z_historicos: 'https://cdn.sassoapps.com/Gabvy/z_historicos.geojson',
    rutaWixarika: 'https://cdn.sassoapps.com/Gabvy/rutaWixarika.geojson',
    localidades_base: 'https://cdn.sassoapps.com/Gabvy/capas/' // Base para carga dinámica
};

// --- STATE BOUNDING BOXES (INDEX SPATIAL) ---
const STATE_BBOXES = {
    'aguascalientes': [-102.87, 21.62, -101.85, 22.46],
    'bajacalifornia': [-117.13, 27.99, -112.76, 32.72],
    'bajacaliforniasur': [-115.09, 22.87, -109.41, 28.00],
    'campeche': [-92.47, 17.81, -89.12, 20.84],
    'coahuila': [-103.96, 24.54, -99.84, 29.88],
    'colima': [-104.83, 18.68, -103.48, 19.52],
    'chiapas': [-94.14, 14.53, -90.37, 17.98],
    'chihuahua': [-109.07, 25.56, -103.31, 31.79],
    'cdmx': [-99.36, 19.05, -98.94, 19.59],
    'durango': [-107.21, 22.35, -102.47, 26.83],
    'guanajuato': [-102.10, 19.91, -99.68, 21.82],
    'guerrero': [-102.20, 16.31, -98.01, 18.88],
    'hidalgo': [-99.87, 19.60, -97.98, 21.40],
    'jalisco': [-105.70, 18.93, -101.51, 22.75],
    'mexico': [-100.61, 18.36, -98.59, 20.28], // EdoMex
    'michoacan': [-103.74, 17.91, -100.06, 20.39],
    'morelos': [-99.50, 18.33, -98.65, 19.14],
    'nayarit': [-105.76, 20.60, -103.72, 23.08],
    'nuevoleon': [-100.99, 23.16, -98.42, 27.80],
    'oaxaca': [-98.54, 15.66, -93.87, 18.65],
    'puebla': [-99.07, 17.81, -96.73, 20.83],
    'queretaro': [-100.61, 20.02, -99.03, 21.67],
    'quintanaroo': [-89.37, 17.89, -86.72, 21.63],
    'sanluispotosi': [-102.30, 21.16, -98.33, 24.48],
    'sinaloa': [-109.47, 22.50, -105.38, 27.03],
    'sonora': [-115.06, 26.29, -108.42, 32.50],
    'tabasco': [-94.13, 17.25, -91.00, 18.65],
    'tamaulipas': [-100.15, 22.21, -97.14, 27.67],
    'tlaxcala': [-98.66, 19.11, -97.63, 19.74],
    'veracruz': [-98.70, 17.13, -93.60, 22.47],
    'yucatan': [-90.41, 19.55, -87.53, 21.62],
    'zacatecas': [-104.36, 21.04, -100.72, 25.15]
};

async function getDynamicLocalities(kmlBounds) {
    if (!kmlBounds) return { type: 'FeatureCollection', features: [] };

    const kmlMinX = kmlBounds.getWest();
    const kmlMinY = kmlBounds.getSouth();
    const kmlMaxX = kmlBounds.getEast();
    const kmlMaxY = kmlBounds.getNorth();

    console.log(`[Dynamic] KML Bounds: [${kmlMinX}, ${kmlMinY}, ${kmlMaxX}, ${kmlMaxY}]`);

    const intersectedStates = [];
    for (const [state, bbox] of Object.entries(STATE_BBOXES)) {
        if (kmlMaxX < bbox[0] || kmlMinX > bbox[2] || kmlMaxY < bbox[1] || kmlMinY > bbox[3]) {
            continue;
        }
        intersectedStates.push(state);
    }

    if (intersectedStates.length === 0) {
        console.warn('[Dynamic] No states intersected!');
        return { type: 'FeatureCollection', features: [] };
    }

    console.log(`[Dynamic] Intersected States: ${intersectedStates.join(', ')}`);
    // showAlert(`Cargando estados: ${intersectedStates.join(', ')}`, 'info');

    const promises = intersectedStates.map(async state => {
        const cacheKey = `loc_${state}`;
        if (dataCache.has(cacheKey)) {
            console.log(`[Dynamic] Using cached: ${state}`);
            return dataCache.get(cacheKey);
        }

        const url = `${urls.localidades_base}loc_total${state}_4326.geojson`;
        try {
            console.log(`[Dynamic] Fetching: ${url}`);
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            dataCache.set(cacheKey, data);
            return data;
        } catch (e) {
            console.error(`[Dynamic] Error loading ${state}:`, e);
            showAlert(`Error cargando ${state}`, 'danger');
            return null;
        }
    });

    const results = await Promise.all(promises);
    const allFeatures = [];
    results.forEach(gj => {
        if (gj && gj.features) {
            allFeatures.push(...gj.features);
        }
    });

    console.log(`[Dynamic] Total features merged: ${allFeatures.length}`);
    return { type: 'FeatureCollection', features: allFeatures };
}

const dataCache = new Map();

// Configuración de visualización para las 15 capas
const LAYER_CONFIG = {
    localidades: { name: 'Localidades (Pol)', color: '#3b82f6', icon: 'layers' },
    municipios: { name: 'Municipios', color: '#64748b', icon: 'map' },
    atlas: { name: 'Atlas Indígena', color: '#ff00ff', icon: 'temple_buddhist' },
    regiones: { name: 'Regiones Indígenas', color: '#ffa500', icon: 'public' },
    lenguas: { name: 'Lenguas Indígenas', color: '#00ffff', icon: 'translate' },
    ruta: { name: 'Ruta Wixarika', color: '#ff8000', icon: 'alt_route' },
    ran: { name: 'Núcleos Agrarios', color: '#8B4513', icon: 'agriculture' },
    anp_estatal: { name: 'ANP Estatal', color: '#22c55e', icon: 'nature' },
    ramsar: { name: 'Sitios Ramsar', color: '#0ea5e9', icon: 'water' },
    za_publico: { name: 'Zonas Arq. (Público)', color: '#ef4444', icon: 'account_balance' }, // Icono cambiado de 'pyramid' a 'account_balance' (o 'temple_hindu' si prefieres algo más histórico)
    za_publico_a: { name: 'Zonas Arq. (Público A)', color: '#ef4444', icon: 'account_balance' },
    sitio_arqueologico: { name: 'Sitios Arqueológicos', color: '#b91c1c', icon: 'history_edu' },
    z_historicos: { name: 'Zonas Históricas', color: '#d97706', icon: 'account_balance' }
};

// --- HELPER FUNCTIONS ---

function showAlert(message, type = 'info') {
    const container = document.getElementById('toastContainer') || document.body;
    const toast = document.createElement('div');
    toast.className = `alert alert-${type} tw-fixed tw-bottom-20 tw-left-1/2 tw-transform -tw-translate-x-1/2 tw-z-[9999] tw-shadow-2xl tw-border-0 tw-rounded-2xl tw-flex tw-items-center tw-gap-3 tw-animate-bounce tw-px-6 tw-py-3 tw-bg-white tw-border tw-border-gray-100`;
    if (type === 'success') toast.classList.add('tw-text-green-600');
    else if (type === 'danger') toast.classList.add('tw-text-red-600');
    else toast.classList.add('tw-text-blue-600');
    const icon = type === 'success' ? 'check_circle' : (type === 'danger' ? 'error' : 'info');
    toast.innerHTML = `<span class="material-symbols-outlined">${icon}</span><span class="tw-text-xs tw-font-bold">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('tw-animate-bounce');
        toast.style.opacity = '0';
        toast.style.transition = 'all 0.5s ease';
        setTimeout(() => toast.remove(), 500);
    }, 3500);
}

function showPreloader(status = 'Procesando...') {
    const p = document.getElementById('preloader');
    const s = document.getElementById('preloaderStatus');
    const b = document.getElementById('preloaderBar');
    if (p) p.classList.add('active');
    if (s) s.textContent = status;
    if (b) b.style.width = '5%';
    document.body.style.cursor = 'wait';
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
}

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
                dataCache.set(layerKey, data);
                return data;
            }
        } catch (err) { console.warn(`Intento ${i + 1} fallido para ${layerKey}`); }
    }
    return { type: 'FeatureCollection', features: [] };
}

// --- MAP INITIALIZATION ---

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

    // Click para limpiar highlight
    map.on('click', () => {
        if (window.highlightLayer) {
            map.removeLayer(window.highlightLayer);
            window.highlightLayer = null;
            map.closePopup();
        }
    });
}

// --- MULTI-KML LOGIC ---

function processKmlFile(file) {
    showPreloader('Analizando KML...');
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const kmlDom = new DOMParser().parseFromString(e.target.result, 'text/xml');
            const gj = toGeoJSON.kml(kmlDom);
            const polys = gj.features.filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));

            if (polys.length === 0) throw new Error('No se encontraron polígonos en el KML');

            // Asignar ID y color
            kmlCounter++;
            const id = `kml_${kmlCounter}`;
            const color = kmlColors[(kmlCounter - 1) % kmlColors.length];

            // Crear layer
            const kmlGeoJson = { type: 'FeatureCollection', features: [polys[0]] };
            const layer = L.geoJSON(kmlGeoJson, {
                style: { color: color, weight: 4, fillOpacity: 0.1, dashArray: '5, 5' }
            }).addTo(map);

            // Métricas
            const area = (window.turf.area(polys[0]) / 1000000).toFixed(2);

            // Guardar en Map
            kmlLayers.set(id, {
                id: id,
                name: file.name,
                geojson: kmlGeoJson,
                layer: layer,
                bufferLayer: null,
                color: color,
                metrics: { area },
                analysis: {}, // Aquí se guardarán los resultados del análisis
                clippedLayers: {} // Capas visuales del análisis
            });

            activeKmlId = id; // Activar el recién subido
            updateKmlListUI();
            updateBufferVisualization(); // Dibuja buffer para el activo
            map.fitBounds(layer.getBounds(), { padding: [50, 50] });

            showAlert(`KML Agregado: ${file.name} (${area} km²)`, 'success');

            // Habilitar botón de análisis si hay al menos 1 kml
            document.getElementById('uploadKmlBtn').disabled = false;

        } catch (err) {
            showAlert('Error KML: ' + err.message, 'danger');
        } finally {
            hidePreloader();
            // Reset input
            document.getElementById('kmlFile').value = '';
        }
    };
    reader.readAsText(file);
}

function removeKml(id) {
    if (!kmlLayers.has(id)) return;
    const data = kmlLayers.get(id);

    // Remover capas del mapa
    if (data.layer) map.removeLayer(data.layer);
    if (data.bufferLayer) map.removeLayer(data.bufferLayer);
    Object.values(data.clippedLayers).forEach(l => map.removeLayer(l));

    kmlLayers.delete(id);

    if (activeKmlId === id) {
        // Si borramos el activo, activar el último disponible o null
        activeKmlId = kmlLayers.size > 0 ? Array.from(kmlLayers.keys()).pop() : null;
    }

    updateKmlListUI();
    updateBufferVisualization();

    if (kmlLayers.size === 0) {
        document.getElementById('uploadKmlBtn').disabled = true;
    }
}

function updateKmlListUI() {
    const container = document.getElementById('kmlListContainer');
    const badge = document.getElementById('kmlCountBadge');

    container.innerHTML = '';
    badge.textContent = `${kmlLayers.size}/10`;

    if (kmlLayers.size === 0) {
        container.classList.add('tw-hidden');
        return;
    }

    container.classList.remove('tw-hidden');

    kmlLayers.forEach((data, id) => {
        const div = document.createElement('div');
        const isActive = id === activeKmlId;
        div.className = `tw-flex tw-items-center tw-justify-between tw-p-2 tw-rounded-lg tw-border tw-transition-colors ${isActive ? 'tw-bg-gray-50 tw-border-primary/30' : 'tw-bg-white tw-border-gray-100 hover:tw-bg-gray-50'}`;

        div.innerHTML = `
            <div class="tw-flex tw-items-center tw-gap-2 tw-flex-1 tw-cursor-pointer" onclick="setActiveKml('${id}')">
                <div class="tw-w-3 tw-h-3 tw-rounded-full" style="background-color: ${data.color}"></div>
                <div class="tw-flex-1">
                    <p class="tw-text-[10px] tw-font-bold ${isActive ? 'tw-text-primary' : 'tw-text-gray-600'} tw-truncate tw-w-32">${data.name}</p>
                    <p class="tw-text-[9px] tw-text-gray-400">${data.metrics.area} km²</p>
                </div>
            </div>
            <button onclick="removeKml('${id}')" class="tw-text-gray-400 hover:tw-text-red-500">
                <span class="material-symbols-outlined tw-text-sm">close</span>
            </button>
        `;
        container.appendChild(div);
    });
}

function setActiveKml(id) {
    activeKmlId = id;
    updateKmlListUI();
    updateBufferVisualization();

    const data = kmlLayers.get(id);
    if (data && data.layer) {
        map.fitBounds(data.layer.getBounds(), { padding: [50, 50] });
    }
}

// --- BUFFER LOGIC (Adapted for Active KML) ---

window.updateBufferVisualization = function () {
    // Primero limpiar todos los buffers visuales
    kmlLayers.forEach(d => {
        if (d.bufferLayer) {
            map.removeLayer(d.bufferLayer);
            d.bufferLayer = null;
        }
    });

    if (!activeKmlId || !kmlLayers.has(activeKmlId)) return;

    const data = kmlLayers.get(activeKmlId);
    const clipTypeSelect = document.getElementById('clipTypeSelect');
    const type = clipTypeSelect ? clipTypeSelect.value : 'direct';
    const customVal = parseFloat(document.getElementById('customBufferInput')?.value || 0);

    const customContainer = document.getElementById('customBufferContainer');
    if (type === 'custom') customContainer?.classList.remove('tw-hidden');
    else customContainer?.classList.add('tw-hidden');

    // Calcular y dibujar buffer solo para el activo
    const originalFeature = data.geojson.features[0];
    const bufferedFeature = applyClipBuffer(originalFeature, type, customVal);

    if (type !== 'exact') {
        data.bufferLayer = L.geoJSON(bufferedFeature, {
            style: {
                color: data.color,
                weight: 2,
                fillOpacity: 0.05,
                fillColor: data.color,
                dashArray: '2, 4'
            }
        }).addTo(map);
        data.bufferLayer.bringToBack();
    }
};

function applyClipBuffer(feature, type, customVal = 0) {
    const T = window.turf;
    if (!T || !feature) return feature;
    try {
        if (type === 'direct') return T.buffer(feature, 2, { units: 'kilometers' });
        if (type === 'indirect') return T.buffer(feature, 5, { units: 'kilometers' });
        if (type === 'custom' && customVal > 0) return T.buffer(feature, customVal, { units: 'kilometers' });
        return feature;
    } catch (e) { return feature; }
}

// --- ANALYSIS LOGIC (MULTI) ---

async function performClipping() {
    if (kmlLayers.size === 0) { showAlert('Carga al menos un KML', 'info'); return; }

    showPreloader('Iniciando Análisis Multi-KML...');
    await new Promise(r => setTimeout(r, 100)); // UI refresh

    try {
        const clipTypeSelect = document.getElementById('clipTypeSelect');
        const type = clipTypeSelect ? clipTypeSelect.value : 'direct';
        const customVal = parseFloat(document.getElementById('customBufferInput')?.value || 0);

        // Identificar tareas (capas seleccionadas)
        const isChecked = (id) => document.querySelector(`input[value="${id}"]`)?.checked;
        const tasks = [
            { id: 'localidades', type: 'poly', key: 'localidades', urlKey: 'localidades' },
            { id: 'municipios', type: 'poly', key: 'municipios', urlKey: 'municipios' },
            { id: 'atlas', type: 'point', key: 'atlas', urlKey: 'atlas' },
            { id: 'regiones', type: 'poly', key: 'regiones', urlKey: 'regiones' },
            { id: 'lenguas', type: 'point', key: 'lenguas', urlKey: 'lenguas' },
            { id: 'ruta', type: 'poly', key: 'ruta', urlKey: 'rutaWixarika' },
            { id: 'ran', type: 'poly', key: 'ran', urlKey: 'ran' },
            { id: 'anp_estatal', type: 'poly', key: 'anp_estatal', urlKey: 'anp_estatal' },
            { id: 'ramsar', type: 'poly', key: 'ramsar', urlKey: 'ramsar' },
            { id: 'za_publico', type: 'poly', key: 'za_publico', urlKey: 'za_publico' },
            { id: 'sitio_arqueologico', type: 'point', key: 'sitio_arqueologico', urlKey: 'sitio_arqueologico' },
            { id: 'z_historicos', type: 'poly', key: 'z_historicos', urlKey: 'z_historicos' }
        ];
        const selectedTasks = tasks.filter(t => isChecked(t.id));

        if (selectedTasks.length === 0) {
            showAlert('Selecciona capas para analizar', 'warning');
            hidePreloader();
            return;
        }

        // Limpiar análisis previos
        kmlLayers.forEach(d => {
            Object.values(d.clippedLayers).forEach(l => map.removeLayer(l));
            d.clippedLayers = {};
            d.analysis = {};
        });

        // PROCESAMIENTO: Para cada KML -> Para cada Capa
        // Optimización: Descargar capas una sola vez
        for (let i = 0; i < selectedTasks.length; i++) {
            const task = selectedTasks[i];
            const config = LAYER_CONFIG[task.id];
            updatePreloader(`PROCESANDO: ${config.name.toUpperCase()}`, Math.round(((i) / selectedTasks.length) * 100));

            // Descarga (con cache)
            let layerData;
            if (task.id === 'localidades' && kmlLayers.size > 0) {
                // Para V3, calculamos el bound total de TODOS los KMLs
                let globalBounds = null;
                kmlLayers.forEach(d => {
                    if (d.layer) {
                        const b = d.layer.getBounds();
                        if (!globalBounds) globalBounds = b;
                        else globalBounds.extend(b);
                    }
                });
                layerData = await getDynamicLocalities(globalBounds);
            } else {
                layerData = await getLayerData(task.urlKey);
            }

            if (!layerData || !layerData.features.length) continue;

            // Aplicar a cada KML
            for (const [kmlId, kmlData] of kmlLayers) {
                const clipArea = applyClipBuffer(kmlData.geojson.features[0], type, customVal);

                // Estilo: Usar SIEMPRE el color oficial de la capa (consistencia de leyenda), no el del KML
                // Y forzar pointToLayer siempre para evitar que Leaflet use el marcador azul por defecto en capas mixtas
                const style = {
                    style: { color: config.color, weight: 2, fillOpacity: 0.4 },
                    pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 6, fillColor: config.color, color: '#fff', weight: 1, fillOpacity: 0.9 })
                };

                const r = clipLayer(layerData, style, (p) => formatPopupAllProperties(config.name, p), clipArea);

                if (r.clipped.length > 0) {
                    const layer = r.layer.addTo(map);
                    kmlData.clippedLayers[task.key] = layer;
                    kmlData.analysis[task.key] = r.clipped;
                }
            }
        }

        // Finalizar
        updateLateralControl();
        updateLegend();
        updateResultsBadge();

        // Mostrar botón flotante
        document.getElementById('floatingResultsBtn').classList.remove('tw-hidden');
        document.getElementById('floatingResultsBtn').classList.add('tw-flex');

        showAlert('Análisis Multi-KML Completado', 'success');

    } catch (e) {
        console.error(e);
        showAlert('Error en análisis', 'danger');
    } finally {
        hidePreloader();
    }
}

// Reutilizamos la función de recorte de V2
function clipLayer(data, styleOptions, popupFormatter, clipArea) {
    const T = window.turf;
    if (!T || !clipArea || !data.features) return { clipped: [], layer: L.layerGroup() };
    const clipBbox = T.bbox(clipArea);
    const clipPoly = T.bboxPolygon(clipBbox);
    const clipped = data.features.filter(f => {
        try {
            if (!T.booleanIntersects(f, clipPoly)) return false;
            return T.booleanIntersects(f.geometry, clipArea.geometry);
        } catch (_) { return false; }
    });
    const layer = L.geoJSON(T.featureCollection(clipped), styleOptions);
    if (popupFormatter) layer.eachLayer(l => l.bindPopup(popupFormatter(l.feature.properties)));
    return { clipped, layer };
}

// --- UI UPDATES (MULTI) ---

function updateLateralControl() {
    const ctrl = document.getElementById('lateralLayerControl');
    if (!ctrl) return;
    ctrl.innerHTML = '';

    // En V3, el control lateral muestra capas agregadas. 
    // Si hay muchos KMLs, mostrar cada capa individualmente puede ser caótico.
    // Estrategia: Mostrar botones por TIPO de capa (ej. Localidades), que activan/desactivan esa capa en TODOS los KMLs.

    const activeLayerKeys = new Set();
    kmlLayers.forEach(d => {
        Object.keys(d.clippedLayers).forEach(k => activeLayerKeys.add(k));
    });

    if (activeLayerKeys.size === 0) {
        ctrl.classList.add('tw-hidden');
        return;
    }
    ctrl.classList.remove('tw-hidden');

    activeLayerKeys.forEach(key => {
        const config = LAYER_CONFIG[key];
        const btn = document.createElement('div');
        // Check si está visible en al menos un KML (asumimos sincronizados por defecto)
        // Simplificación: toggle global
        let isVisible = true;

        btn.className = 'tw-w-8 tw-h-8 tw-rounded-full tw-flex tw-items-center tw-justify-center tw-cursor-pointer tw-transition-transform hover:tw-scale-110 tw-border tw-border-gray-200';
        btn.style.backgroundColor = config.color;
        btn.style.color = 'white';
        btn.title = config.name;
        btn.innerHTML = `<span class="material-symbols-outlined tw-text-sm">${config.icon}</span>`;

        btn.onclick = () => {
            isVisible = !isVisible;
            btn.style.backgroundColor = isVisible ? config.color : '#f3f4f6';
            btn.style.color = isVisible ? 'white' : '#9ca3af';

            kmlLayers.forEach(d => {
                if (d.clippedLayers[key]) {
                    if (isVisible) d.clippedLayers[key].addTo(map);
                    else map.removeLayer(d.clippedLayers[key]);
                }
            });
            updateLegend();
        };
        ctrl.appendChild(btn);
    });
}

function updateResultsBadge() {
    // Suma total de todos los elementos en todos los KMLs
    let total = 0;
    kmlLayers.forEach(d => {
        Object.values(d.analysis).forEach(list => total += list.length);
    });
    const badge = document.getElementById('resultsBadgeCount');
    if (badge) badge.textContent = total;
}

window.updateLegend = function () {
    const legendEl = document.getElementById('mapLegend');
    const itemsContainer = document.getElementById('legendItems');
    if (!legendEl || !itemsContainer) return;
    itemsContainer.innerHTML = '';

    // Leyenda V3: Mostrar KMLs y Capas Activas
    // 1. KMLs
    kmlLayers.forEach((data, id) => {
        const item = document.createElement('div');
        item.className = 'tw-flex tw-items-center tw-gap-2 tw-mb-1';
        item.innerHTML = `
            <div class="tw-w-3 tw-h-3 tw-rounded-full" style="background-color: ${data.color}"></div>
            <span class="tw-text-[10px] tw-font-bold tw-text-gray-600 tw-truncate tw-max-w-[150px]">${data.name}</span>
        `;
        itemsContainer.appendChild(item);
    });

    if (kmlLayers.size > 0) {
        const sep = document.createElement('div');
        sep.className = 'tw-h-px tw-bg-gray-200 tw-my-2';
        itemsContainer.appendChild(sep);
    }

    // 2. Capas (Globales)
    // Solo mostramos capas que estén visibles
    const visibleLayerKeys = new Set();
    kmlLayers.forEach(d => {
        Object.entries(d.clippedLayers).forEach(([key, layer]) => {
            if (map.hasLayer(layer)) visibleLayerKeys.add(key);
        });
    });

    visibleLayerKeys.forEach(key => {
        const config = LAYER_CONFIG[key];
        const item = document.createElement('div');
        item.className = 'tw-flex tw-items-center tw-gap-2 tw-mb-1';
        item.innerHTML = `
            <span class="material-symbols-outlined tw-text-[10px] tw-text-gray-400">${config.icon}</span>
            <span class="tw-text-[10px] tw-font-bold tw-text-gray-600">${config.name}</span>
        `;
        itemsContainer.appendChild(item);
    });

    if (kmlLayers.size > 0) legendEl.classList.remove('tw-hidden');
    else legendEl.classList.add('tw-hidden');
}

// --- MODAL V3 ---

function openResultsModal() {
    const modal = document.getElementById('resultsModal');
    modal.classList.add('active');

    // Llenar selector de KMLs
    const selector = document.getElementById('kmlResultSelector');
    selector.innerHTML = '<option value="all" class="tw-text-gray-800">Resumen Combinado</option>';
    kmlLayers.forEach((data, id) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = data.name;
        opt.className = "tw-text-gray-800"; // Asegurar texto visible en opciones
        if (id === activeKmlId) opt.selected = true;
        selector.appendChild(opt);
    });

    // Render inicial
    renderModalContentV3(selector.value);

    selector.onchange = (e) => renderModalContentV3(e.target.value);
}

function closeResultsModal() {
    document.getElementById('resultsModal').classList.remove('active');
}

let currentModalData = null;

function renderModalContentV3(mode) {
    let dataToRender = {}; // { layerKey: { title, icon, features: [] } }

    if (mode === 'all') {
        // Combinar todo
        kmlLayers.forEach(d => {
            Object.entries(d.analysis).forEach(([key, features]) => {
                if (!dataToRender[key]) {
                    dataToRender[key] = {
                        title: LAYER_CONFIG[key].name,
                        icon: LAYER_CONFIG[key].icon,
                        features: [],
                        key: key
                    };
                }
                // Añadir propiedad KML_SOURCE para saber de quién es
                const taggedFeatures = features.map(f => {
                    const props = { ...f.properties, _KML_SOURCE: d.name, _KML_COLOR: d.color };
                    return { ...f, properties: props };
                });
                dataToRender[key].features.push(...taggedFeatures);
            });
        });
    } else {
        // Un solo KML
        const d = kmlLayers.get(mode);
        if (d) {
            Object.entries(d.analysis).forEach(([key, features]) => {
                dataToRender[key] = {
                    title: LAYER_CONFIG[key].name,
                    icon: LAYER_CONFIG[key].icon,
                    features: features,
                    key: key
                };
            });
        }
    }

    currentModalData = dataToRender;

    const total = Object.values(dataToRender).reduce((s, l) => s + l.features.length, 0);
    document.getElementById('totalElementsCount').textContent = `${total.toLocaleString('es-MX')} ELEMENTOS TOTALES`;

    // Render Filters
    const filtersContainer = document.getElementById('layerFilters');
    filtersContainer.innerHTML = '';
    let firstKey = null;

    Object.entries(dataToRender).forEach(([key, info]) => {
        if (!firstKey) firstKey = key;
        const btn = document.createElement('button');
        btn.className = `tw-w-full tw-text-left tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-rounded-lg tw-mb-1 hover:tw-bg-gray-100 tw-text-gray-500`;
        btn.innerHTML = `
            <div class="tw-flex tw-items-center tw-gap-2">
                <span class="material-symbols-outlined tw-text-sm">${info.icon}</span>
                <span class="tw-text-[10px] tw-font-bold tw-uppercase">${info.title}</span>
            </div>
            <span class="tw-text-[10px] tw-font-bold tw-bg-gray-200 tw-text-gray-600 tw-px-1.5 tw-rounded-md">${info.features.length}</span>
        `;
        btn.onclick = () => {
            // Highlight active
            Array.from(filtersContainer.children).forEach(c => c.classList.remove('tw-bg-primary/10', 'tw-text-primary'));
            btn.classList.add('tw-bg-primary/10', 'tw-text-primary');
            showLayerResultsV3(key, info);
        };
        filtersContainer.appendChild(btn);
    });

    // Show first
    if (firstKey) {
        filtersContainer.firstChild.click();
    } else {
        document.getElementById('layerResultsContainer').innerHTML = '<div class="tw-text-center tw-text-gray-400">Sin datos</div>';
    }
}

function showLayerResultsV3(key, info) {
    const container = document.getElementById('layerResultsContainer');
    const features = info.features;

    if (features.length === 0) {
        container.innerHTML = '<div class="tw-text-center tw-text-gray-400">Sin datos</div>';
        return;
    }

    // Tabla simple (sin paginación compleja por ahora para V3)
    const firstProps = features[0].properties;
    // Filtrar columnas internas
    const headers = Object.keys(firstProps).filter(k => !k.startsWith('_')).slice(0, 5);

    let html = `
        <div class="tw-flex tw-items-center tw-justify-between tw-mb-4">
            <h3 class="tw-text-xs tw-font-black tw-text-primary tw-uppercase">${info.title} (${features.length})</h3>
        </div>
        <div class="tw-overflow-x-auto tw-rounded-lg tw-border tw-border-gray-100">
            <table class="tw-w-full tw-text-left">
                <thead class="tw-bg-gray-50">
                    <tr>
                        <th class="tw-px-4 tw-py-2 tw-text-[9px] tw-font-black tw-text-gray-400 tw-uppercase">Origen KML</th>
                        ${headers.map(h => `<th class="tw-px-4 tw-py-2 tw-text-[9px] tw-font-black tw-text-gray-400 tw-uppercase">${h}</th>`).join('')}
                    </tr>
                </thead>
                <tbody class="tw-divide-y tw-divide-gray-50">
                    ${features.slice(0, 100).map(f => `
                        <tr class="hover:tw-bg-gray-50 tw-cursor-pointer" onclick='zoomToFeatureV3(${JSON.stringify(f.geometry)}, ${JSON.stringify(f.properties)})'>
                            <td class="tw-px-4 tw-py-2">
                                <span class="tw-text-[9px] tw-font-bold tw-px-2 tw-py-0.5 tw-rounded-full tw-text-white" style="background-color: ${f.properties._KML_COLOR || '#ccc'}">
                                    ${f.properties._KML_SOURCE || 'KML'}
                                </span>
                            </td>
                            ${headers.map(h => `<td class="tw-px-4 tw-py-2 tw-text-[10px] tw-text-gray-600">${f.properties[h] || '-'}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ${features.length > 100 ? '<div class="tw-p-2 tw-text-center tw-text-[10px] tw-text-gray-400">Mostrando primeros 100 registros</div>' : ''}
        </div>
    `;
    container.innerHTML = html;
}

window.zoomToFeatureV3 = function (geometry, properties) {
    // Reutilizar lógica de V2 pero adaptada
    if (!geometry) return;

    // Clean
    if (window.highlightLayer) map.removeLayer(window.highlightLayer);

    const layer = L.geoJSON(geometry);
    const bounds = layer.getBounds();

    // Zoom
    if (geometry.type === 'Point') {
        map.setView([geometry.coordinates[1], geometry.coordinates[0]], 16);
    } else {
        map.fitBounds(bounds, { padding: [100, 100] });
    }

    // Highlight
    window.highlightLayer = L.geoJSON(geometry, {
        pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 10, color: '#800020', fillColor: '#800020', className: 'pulse-animation' }),
        style: { color: '#800020', weight: 4, fillOpacity: 0.1, className: 'pulse-animation' }
    }).addTo(map);

    // Popup
    let name = properties.VARIANTE || properties.variante || properties.LOCALIDAD || properties.nombre || properties.Nombre || 'Elemento';
    L.popup({ className: 'custom-popup-guinda', closeButton: false })
        .setLatLng(geometry.type === 'Point' ? [geometry.coordinates[1], geometry.coordinates[0]] : bounds.getCenter())
        .setContent(`<div class="tw-text-center tw-font-black tw-text-primary tw-text-xs uppercase p-2">${name}</div>`)
        .openOn(map);

    closeResultsModal();

    setTimeout(() => {
        if (window.highlightLayer) { map.removeLayer(window.highlightLayer); window.highlightLayer = null; map.closePopup(); }
    }, 5000);
}

// --- EXPORT ---

window.downloadModalExcel = function () {
    if (!currentModalData) return;
    const wb = XLSX.utils.book_new();

    // 1. Hoja de INFORMACIÓN GENERAL (Resumen de KMLs)
    // Obtener qué KMLs están en el contexto actual (todos o uno específico)
    const kmlContext = [];
    const selector = document.getElementById('kmlResultSelector');
    const mode = selector ? selector.value : 'all';

    if (mode === 'all') {
        kmlLayers.forEach(d => kmlContext.push(d));
    } else {
        const d = kmlLayers.get(mode);
        if (d) kmlContext.push(d);
    }

    if (kmlContext.length > 0) {
        const infoRows = kmlContext.map(d => ({
            'ID KML': d.name,
            'Área (km²)': d.metrics.area,
            'Color Identificador': d.color,
            'Total Hallazgos': Object.values(d.analysis).reduce((sum, arr) => sum + arr.length, 0)
        }));
        const wsInfo = XLSX.utils.json_to_sheet(infoRows);
        XLSX.utils.book_append_sheet(wb, wsInfo, 'INFORMACIÓN GENERAL');
    }

    // 2. Hojas por Capa (Detalle)
    Object.entries(currentModalData).forEach(([key, info]) => {
        if (info.features.length > 0) {
            const rows = info.features.map(f => {
                // Limpiar props internas para el excel pero MANTENER el origen KML
                const { _KML_COLOR, ...rest } = f.properties;
                // Renombrar clave de origen para que sea más clara en el Excel
                const finalRow = { 'ORIGEN KML': rest._KML_SOURCE, ...rest };
                delete finalRow._KML_SOURCE;
                return finalRow;
            });
            const ws = XLSX.utils.json_to_sheet(rows);
            // Nombre de hoja seguro (max 31 chars)
            let sheetName = info.title.replace(/[\\/?*\[\]]/g, '').substring(0, 30);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        }
    });

    const fileName = mode === 'all'
        ? `Analisis_Combinado_V3_${new Date().getTime()}.xlsx`
        : `Analisis_${kmlContext[0]?.name.replace('.kml', '')}_${new Date().getTime()}.xlsx`;

    XLSX.writeFile(wb, fileName);
}

window.exportMapToPNG = function () {
    if (kmlLayers.size === 0) {
        showAlert('Carga al menos un KML para exportar.', 'warning');
        return;
    }

    // 1. Cerrar modal, limpiar highlight y UI
    closeResultsModal();
    if (window.highlightLayer) {
        map.removeLayer(window.highlightLayer);
        window.highlightLayer = null;
    }

    // 2. Esperar renderizado
    setTimeout(() => {
        showPreloader('Generando imagen de alta resolución...');

        const mapContainer = document.getElementById('map');
        const legend = document.getElementById('mapLegend');

        // Forzar leyenda visible para que Leaflet/HTML2Canvas la "vea" si es necesario, 
        // aunque la dibujaremos manualmente para mejor calidad.
        const wasLegendHidden = legend.classList.contains('tw-hidden');
        if (wasLegendHidden) legend.classList.remove('tw-hidden');

        html2canvas(mapContainer, {
            useCORS: true,
            allowTaint: false, // Evitar tainted canvas
            scale: 2, // Retina quality
            backgroundColor: '#ffffff',
            ignoreElements: (element) => {
                return element.classList.contains('leaflet-control-zoom') ||
                    element.id === 'openControl' ||
                    element.id === 'floatingResultsBtn' ||
                    element.id === 'lateralLayerControl' ||
                    element.id === 'toastContainer';
            }
        }).then(canvas => {
            // Restaurar estado UI
            if (wasLegendHidden) legend.classList.add('tw-hidden');

            // 3. Post-Procesamiento con Canvas API
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = canvas.width;
            finalCanvas.height = canvas.height;
            const ctx = finalCanvas.getContext('2d');
            const scale = 2;

            // Dibujar Mapa Base
            ctx.drawImage(canvas, 0, 0);

            // --- A. TÍTULO Y METADATOS ---
            const boxWidth = 450 * scale;
            const boxHeight = 110 * scale;
            const x = 20 * scale;
            const y = finalCanvas.height - boxHeight - (20 * scale);
            const padding = 20 * scale;

            // Fondo Title Box
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
            ctx.shadowBlur = 10 * scale;
            ctx.beginPath();
            ctx.roundRect(x, y, boxWidth, boxHeight, 12 * scale);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Textos
            ctx.fillStyle = '#800020'; // Primary Guinda
            ctx.font = `800 ${18 * scale}px Montserrat, sans-serif`;
            ctx.fillText('CENTRO DE CONTROL V3', x + padding, y + (35 * scale));

            ctx.fillStyle = '#4b5563'; // Gray
            ctx.font = `600 ${12 * scale}px Inter, sans-serif`;
            ctx.fillText('ANÁLISIS COMPARATIVO MULTI-KML', x + padding, y + (60 * scale));

            const dateStr = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            ctx.font = `${10 * scale}px Inter, sans-serif`;
            ctx.fillText(`FECHA: ${dateStr.toUpperCase()}`, x + padding, y + (85 * scale));

            // --- B. LEYENDA DINÁMICA ---
            // Calcular items a mostrar
            const kmlItems = [];
            kmlLayers.forEach(d => kmlItems.push({ name: d.name, color: d.color, area: d.metrics.area }));

            const layerItems = [];
            const visibleLayerKeys = new Set();
            kmlLayers.forEach(d => {
                Object.entries(d.clippedLayers).forEach(([key, layer]) => {
                    if (map.hasLayer(layer)) visibleLayerKeys.add(key);
                });
            });
            visibleLayerKeys.forEach(key => {
                const config = LAYER_CONFIG[key];
                // Calcular total hits global para esta capa
                let totalHits = 0;
                kmlLayers.forEach(d => {
                    if (d.analysis[key]) totalHits += d.analysis[key].length;
                });
                layerItems.push({ name: config.name, color: config.color, count: totalHits });
            });

            // Si hay algo que mostrar en leyenda
            if (kmlItems.length > 0 || layerItems.length > 0) {
                const itemHeight = 25 * scale;
                const headerHeight = 30 * scale;
                const totalItems = kmlItems.length + layerItems.length;
                // Si hay ambos tipos, añadimos espacio para separador
                const separatorHeight = (kmlItems.length > 0 && layerItems.length > 0) ? 10 * scale : 0;

                const legendHeight = (totalItems * itemHeight) + (headerHeight * (layerItems.length > 0 ? 2 : 1)) + separatorHeight + (20 * scale);
                const legendWidth = 240 * scale;
                const legendX = finalCanvas.width - legendWidth - (20 * scale);
                const legendY = finalCanvas.height - legendHeight - (20 * scale);

                // Fondo Leyenda
                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
                ctx.shadowBlur = 8 * scale;
                ctx.beginPath();
                ctx.roundRect(legendX, legendY, legendWidth, legendHeight, 12 * scale);
                ctx.fill();
                ctx.shadowBlur = 0;

                let currentY = legendY + (25 * scale);
                const textX = legendX + (40 * scale);
                const dotX = legendX + (25 * scale);

                // 1. KMLs
                if (kmlItems.length > 0) {
                    ctx.fillStyle = '#9ca3af';
                    ctx.font = `bold ${10 * scale}px Montserrat, sans-serif`;
                    ctx.fillText('GEOMETRÍAS (KML)', legendX + (15 * scale), currentY);
                    currentY += (15 * scale);

                    kmlItems.forEach(item => {
                        // Dot
                        ctx.beginPath();
                        ctx.arc(dotX, currentY - (4 * scale), 6 * scale, 0, 2 * Math.PI);
                        ctx.fillStyle = item.color;
                        ctx.fill();

                        // Name
                        ctx.fillStyle = '#374151';
                        ctx.font = `bold ${11 * scale}px Inter, sans-serif`;
                        const name = item.name.length > 25 ? item.name.substring(0, 25) + '...' : item.name;
                        ctx.fillText(name, textX, currentY);

                        currentY += itemHeight;
                    });
                }

                // Separator
                if (separatorHeight > 0) {
                    ctx.beginPath();
                    ctx.moveTo(legendX + (15 * scale), currentY - (10 * scale));
                    ctx.lineTo(legendX + legendWidth - (15 * scale), currentY - (10 * scale));
                    ctx.strokeStyle = '#e5e7eb';
                    ctx.lineWidth = 1 * scale;
                    ctx.stroke();
                    currentY += (5 * scale);
                }

                // 2. Layers
                if (layerItems.length > 0) {
                    ctx.fillStyle = '#9ca3af';
                    ctx.font = `bold ${10 * scale}px Montserrat, sans-serif`;
                    ctx.fillText('HALLAZGOS', legendX + (15 * scale), currentY);
                    currentY += (15 * scale);

                    layerItems.forEach(item => {
                        // Icon/Dot placeholder
                        ctx.beginPath();
                        ctx.arc(dotX, currentY - (4 * scale), 6 * scale, 0, 2 * Math.PI);
                        ctx.fillStyle = item.color;
                        ctx.fill();

                        // Name
                        ctx.fillStyle = '#374151';
                        ctx.font = `bold ${11 * scale}px Inter, sans-serif`;
                        ctx.fillText(item.name, textX, currentY);

                        // Badge Count
                        const countText = item.count.toString();
                        const countWidth = ctx.measureText(countText).width + (12 * scale);
                        ctx.fillStyle = '#f3f4f6';
                        ctx.beginPath();
                        ctx.roundRect(legendX + legendWidth - countWidth - (15 * scale), currentY - (11 * scale), countWidth, 16 * scale, 4 * scale);
                        ctx.fill();

                        ctx.fillStyle = '#6b7280';
                        ctx.font = `bold ${10 * scale}px Inter, sans-serif`;
                        ctx.fillText(countText, legendX + legendWidth - countWidth - (10 * scale), currentY);

                        currentY += itemHeight;
                    });
                }
            }

            // 4. Descargar
            const link = document.createElement('a');
            link.download = `Mapa_V3_Comparativo_${new Date().getTime()}.png`;
            link.href = finalCanvas.toDataURL('image/png');
            link.click();

            hidePreloader();
            showAlert('Imagen exportada correctamente', 'success');

            // Reabrir modal
            setTimeout(() => openResultsModal(), 500);

        }).catch(err => {
            console.error(err);
            hidePreloader();
            showAlert('Error al generar la imagen', 'danger');
            setTimeout(() => openResultsModal(), 500);
        });
    }, 500);
}

// --- INIT ---
function initApp() {
    initMap();

    // Input
    const kInput = document.getElementById('kmlFile');
    if (kInput) {
        kInput.addEventListener('change', (e) => {
            Array.from(e.target.files).forEach(file => processKmlFile(file));
        });
    }

    document.getElementById('uploadKmlBtn').addEventListener('click', performClipping);
    document.getElementById('clearMap').addEventListener('click', () => location.reload());
    document.getElementById('clipTypeSelect').addEventListener('change', window.updateBufferVisualization);
    document.getElementById('customBufferInput').addEventListener('input', window.updateBufferVisualization);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();
