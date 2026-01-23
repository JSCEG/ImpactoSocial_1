/**
 * GEOVISUALIZADOR DE ÁREAS DE INTERÉS - VERSIÓN BÁSICA (REDISEÑO MODAL)
 * ====================================================================
 */
// --- GLOBALS ---
let map, kmlLayer, kmlGeoJson;
let analysisMode = 'auto'; // 'auto' | 'manual'
let clippedAtlasLayer, clippedRegionesLayer, clippedLenguasLayer, clippedLocIndigenasLayer, clippedRutaWixarikaLayer, clippedLocalitiesLayer, clippedPointsLayer;
let clippedLayers = {};
let currentAnalysisResults = null;

let layersData = {};

// Métricas del polígono KML
let kmlMetrics = {
    fileName: '',
    uploadDate: '',
    area: 0, // en km²
    perimeter: 0, // en km
    centroid: null, // { lat, lng }
    bounds: null, // { north, south, east, west }
    vertexCount: 0,
    geometryType: ''
};

const urls = {
    atlas: 'https://cdn.sassoapps.com/Gabvy/atlaspueblosindigenas.geojson',
    regiones: 'https://cdn.sassoapps.com/Gabvy/regionesindigenas.geojson',
    lenguas: 'https://cdn.sassoapps.com/Gabvy/lenguasindigenas.geojson',
    loc_indigenas_datos: 'https://cdn.sassoapps.com/Gabvy/loc_indigenas_datos.geojson',
    rutaWixarika: 'https://cdn.sassoapps.com/Gabvy/rutaWixarika.geojson',
    localidades: 'https://cdn.sassoapps.com/Gabvy/localidades_4326.geojson',
    localities_points: 'https://cdn.sassoapps.com/Gabvy/localidades_puntos.geojson'
};

const dataCache = new Map();

const LAYER_CONFIG = {
    atlas: { name: 'Atlas Indígena', color: '#ff00ff', icon: 'temple_buddhist', desc: 'Territorios' },
    regiones: { name: 'Regiones', color: '#ffa500', icon: 'map', desc: 'Influencia' },
    lenguas: { name: 'Lenguas', color: '#00ffff', icon: 'translate', desc: 'Variantes' },
    loc_ind: { name: 'Datos Indígenas', color: '#8000ff', icon: 'groups', desc: 'Contexto Social' },
    ruta: { name: 'Ruta Wixarika', color: '#ff8000', icon: 'alt_route', desc: 'Ruta' },
    localidades: { name: 'Localidades (Pol)', color: '#3b82f6', icon: 'layers', desc: 'Límites' },
    puntos: { name: 'Localidades (Pnt)', color: '#10b981', icon: 'location_on', desc: 'Ubicación' }
};

// Helper para Toasts visuales
function showAlert(message, type = 'info') {
    const container = document.getElementById('toastContainer') || document.body;
    const toast = document.createElement('div');
    toast.className = `alert alert-${type} tw-fixed tw-bottom-20 tw-left-1/2 tw-transform -tw-translate-x-1/2 tw-z-[9999] tw-shadow-2xl tw-border-0 tw-rounded-2xl tw-flex tw-items-center tw-gap-3 tw-animate-bounce tw-px-6 tw-py-3`;
    toast.style.minWidth = '300px';
    const icon = type === 'success' ? 'check_circle' : (type === 'danger' ? 'error' : 'info');
    toast.innerHTML = `<span class="material-icons-round">${icon}</span>
                       <span class="tw-text-xs tw-font-bold">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('tw-animate-bounce');
        toast.style.opacity = '0';
        toast.style.transition = 'all 0.5s ease';
        setTimeout(() => toast.remove(), 500);
    }, 3500);
}

// Helpers para Preloader Interactivo
function showPreloader(status = 'Iniciando...') {
    console.warn('[PRELOADER] REQUEST SHOW:', status);
    const p = document.getElementById('preloader');
    const s = document.getElementById('preloaderStatus');
    const b = document.getElementById('preloaderBar');

    if (p) {
        p.classList.add('active');
        console.log('[PRELOADER] SUCCESS: .active added to DOM');
    } else {
        console.error('[PRELOADER] FAILED: Element #preloader not found in DOM');
    }

    if (s) s.textContent = status;
    if (b) b.style.width = '5%';

    // Estado del botón
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
    console.warn('[PRELOADER] REQUEST HIDE');
    const p = document.getElementById('preloader');
    if (p) {
        p.classList.remove('active');
    }

    // Estado del botón
    document.body.style.cursor = 'default';
    const btn = document.getElementById('uploadKmlBtn');
    if (btn) btn.disabled = false;
}

/**
 * Formatea todas las propiedades de un feature para el popup
 */
function formatPopupAllProperties(title, props) {
    let html = `<div class="tw-p-1"><div class="tw-text-[10px] tw-font-black tw-text-primary tw-uppercase tw-border-b tw-border-gray-100 tw-pb-1 tw-mb-2">${title}</div>`;
    html += `<div class="tw-max-h-[160px] tw-overflow-y-auto"><table class="tw-w-full tw-text-[9px]">`;
    for (const [key, value] of Object.entries(props)) {
        if (value !== null && value !== undefined && value !== '') {
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
        (u) => u, // Intento directo
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
            if (i === 1) { // allorigins envuelve en .contents
                const pjson = await r.json();
                data = JSON.parse(pjson.contents);
            } else {
                data = await r.json();
            }

            if (data && data.features) {
                console.log(`[Carga] ✓ ${layerKey} cargada con éxito (Intento ${i + 1})`);
                dataCache.set(layerKey, data);
                return data;
            }
        } catch (err) {
            console.warn(`[Carga] ✗ Intento ${i + 1} falló para ${layerKey}:`, err.message);
        }
    }

    console.error(`[Carga] !!! ${layerKey} falló tras todos los intentos.`);
    return { type: 'FeatureCollection', features: [] };
}

function initMap() {
    console.log("Initializing Leaflet...");
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

    // Almacenar baseMaps globalmente para changeBasemap
    window.baseMaps = baseMaps;
    console.log("Leaflet Ready.");
}

window.changeBasemap = function (name, el) {
    if (!window.baseMaps || !map) return;

    // Cambiar capa
    Object.values(window.baseMaps).forEach(layer => {
        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    });
    map.addLayer(window.baseMaps[name]);

    // Actualizar UI
    document.querySelectorAll('.basemap-option').forEach(opt => opt.classList.remove('selected'));
    if (el) el.classList.add('selected');

    showAlert(`Mapa base: ${name}`, 'info');
};

window.toggleAnalysisMode = function (isManual) {
    analysisMode = isManual ? 'manual' : 'auto';
    const modeText = document.getElementById('mode-text');
    const modeDesc = document.getElementById('mode-desc');
    const manualContent = document.getElementById('manual-layers');
    const autoStatus = document.getElementById('auto-status');

    if (analysisMode === 'auto') {
        modeText.textContent = 'MODO AUTOMÁTICO';
        modeText.classList.replace('tw-text-primary', 'tw-text-emerald-600');
        modeDesc.textContent = 'Ejecución inmediata al cargar KML';
        manualContent?.classList.add('tw-hidden');
        autoStatus?.classList.remove('tw-hidden');
    } else {
        modeText.textContent = 'MODO MANUAL';
        modeText.classList.replace('tw-text-emerald-600', 'tw-text-primary');
        modeDesc.textContent = 'Selección granular de capas y control total';
        manualContent?.classList.remove('tw-hidden');
        autoStatus?.classList.add('tw-hidden');
    }
    showAlert(`Modo seleccionado: ${analysisMode.toUpperCase()}`, 'info');
};

// Actualiza el panel de resultados dinámicamente
window.updateResultsPanel = function (results) {
    const nav = document.getElementById('resultsTabsNav');
    const content = document.getElementById('resultsTabsContent');
    const badge = document.getElementById('totalFoundBadge');

    if (!nav || !content) {
        // Fallback or error if elements missing, though we just added them
        console.error("Tabs container not found.");
        return;
    }

    nav.innerHTML = '';
    content.innerHTML = '';
    let totalCount = 0;
    let firstTabId = null;

    Object.entries(results).forEach(([key, data]) => {
        const info = LAYER_CONFIG[key];
        if (!info || !data || data.length === 0) return;

        totalCount += data.length;
        if (!firstTabId) firstTabId = key;

        // 1. Crear Pestaña (Button)
        const btn = document.createElement('button');
        btn.className = `tab-btn tw-flex tw-items-center tw-gap-2 tw-px-4 tw-py-2 tw-rounded-full tw-text-[10px] tw-font-bold tw-uppercase tw-whitespace-nowrap tw-transition-all tw-border tw-border-transparent hover:tw-bg-gray-50 ${key === firstTabId ? 'active tw-bg-primary/10 tw-text-primary tw-border-primary/10' : 'tw-text-gray-400'}`;
        btn.dataset.target = key;
        btn.innerHTML = `
            <span class="material-symbols-outlined tw-text-sm" style="color: ${info.color}">${info.icon || 'layers'}</span>
            ${info.name} <span class="tw-bg-gray-200 tw-text-gray-600 tw-px-1.5 tw-rounded-md tw-text-[9px]">${data.length}</span>
        `;
        btn.onclick = () => switchTab(key);
        nav.appendChild(btn);

        // 2. Crear Contenido de Pestaña (Div with Table)
        const pane = document.createElement('div');
        pane.id = `tab-${key}`;
        pane.className = `tab-pane ${key === firstTabId ? 'active' : 'tw-hidden'} tw-h-full tw-flex tw-flex-col`;

        // Generar filas de tabla
        let tableRows = '';
        let headers = [];

        // Identificar headers (claves comunes) - Tomamos el primer elemento como referencia
        if (data.length > 0) {
            const firstProps = data[0].properties;
            // Excluir propiedades internas y muy largas
            headers = Object.keys(firstProps).filter(k => k !== 'description' && k !== 'styleUrl' && !k.startsWith('_'));
        }

        // Crear tabla HTML
        if (headers.length > 0) {
            const thead = headers.map(h => `<th class="tw-px-3 tw-py-2 tw-text-left tw-text-[9px] tw-font-black tw-text-gray-400 tw-uppercase tw-tracking-wider tw-whitespace-nowrap tw-bg-gray-50 tw-sticky tw-top-0">${h}</th>`).join('');

            const tbody = data.map(f => {
                const tds = headers.map(h => {
                    let val = f.properties[h];
                    if (val === undefined || val === null) val = '-';
                    return `<td class="tw-px-3 tw-py-2 tw-text-[10px] tw-text-gray-600 tw-whitespace-nowrap tw-border-b tw-border-gray-50">${val}</td>`;
                }).join('');
                return `<tr class="hover:tw-bg-gray-50 tw-transition-colors">${tds}</tr>`;
            }).join('');

            pane.innerHTML = `
                <div class="tw-flex tw-items-center tw-justify-between tw-mb-3">
                     <h3 class="tw-text-xs tw-font-black tw-text-gray-800 tw-uppercase">${info.name} (${data.length})</h3>
                     <button onclick="window.zoomToLayer('${key}')" class="tw-flex tw-items-center tw-gap-1 tw-px-2 tw-py-1 tw-bg-white tw-border tw-border-gray-200 tw-rounded-lg hover:tw-bg-gray-50 tw-text-[9px] tw-font-bold tw-text-primary tw-uppercase">
                        <span class="material-symbols-outlined tw-text-xs">near_me</span> Ver en Mapa
                     </button>
                </div>
                <div class="tw-flex-1 tw-overflow-auto tw-border tw-border-gray-100 tw-rounded-xl tw-bg-white custom-scrollbar">
                    <table class="tw-w-full tw-border-collapse">
                        <thead><tr>${thead}</tr></thead>
                        <tbody>${tbody}</tbody>
                    </table>
                </div>
            `;
        } else {
            pane.innerHTML = `<div class="tw-h-full tw-flex tw-items-center tw-justify-center tw-text-gray-400 tw-text-xs tw-font-bold">Sin datos tabulares</div>`;
        }

        content.appendChild(pane);
    });

    if (badge) badge.textContent = `${totalCount} elementos`;

    // Actualizar badge del botón flotante
    const badgeCount = document.getElementById('resultsBadgeCount');
    if (badgeCount) badgeCount.textContent = totalCount;

    if (totalCount > 0) {
        toggleResultsPanel(true);
        // Notificar al usuario
        setTimeout(() => {
            showAlert('Haz clic en el botón verde de resultados para ver los hallazgos.', 'success');
        }, 500);
    }
};

// Función auxiliar para cambiar pestañas
window.switchTab = function (targetKey) {
    // Actualizar botones
    document.querySelectorAll('#resultsTabsNav .tab-btn').forEach(btn => {
        if (btn.dataset.target === targetKey) {
            btn.classList.add('active', 'tw-bg-primary/10', 'tw-text-primary', 'tw-border-primary/10');
            btn.classList.remove('tw-text-gray-400');
        } else {
            btn.classList.remove('active', 'tw-bg-primary/10', 'tw-text-primary', 'tw-border-primary/10');
            btn.classList.add('tw-text-gray-400');
        }
    });

    // Actualizar paneles
    document.querySelectorAll('#resultsTabsContent .tab-pane').forEach(pane => {
        if (pane.id === `tab-${targetKey}`) {
            pane.classList.remove('tw-hidden');
        } else {
            pane.classList.add('tw-hidden');
        }
    });
};

window.toggleResultsPanel = function (show) {
    const panel = document.getElementById('floatingResultsPanel');
    const btn = document.getElementById('floatingResultsBtn');

    if (show) {
        btn.classList.remove('tw-hidden');
        btn.style.display = 'flex';
        // No abrimos automáticamente el panel, solo mostramos el botón
    } else {
        panel.classList.remove('active');
        btn.classList.add('tw-hidden');
    }
};

window.toggleLayerVisibility = function (layerId, visible) {
    const layer = clippedLayers[layerId];
    if (layer) {
        if (visible) {
            layer.addTo(map);
        } else {
            map.removeLayer(layer);
        }
    }
    // Sincronizar UI
    updateLegend();
    updateLateralControl();

    // Sincronizar checkboxes en el panel de resultados y modal
    document.querySelectorAll(`input[onchange*="'${layerId}'"], input[value="${layerId}"]`).forEach(i => i.checked = visible);
};

window.updateLegend = function () {
    const legend = document.getElementById('mapLegend');
    const container = document.getElementById('legendItems');
    if (!legend || !container) return;

    let activeCount = 0;
    container.innerHTML = '';

    Object.keys(clippedLayers).forEach(key => {
        const info = LAYER_CONFIG[key];
        if (!info) return;
        activeCount++;
        const layer = clippedLayers[key];
        const isVisible = map.hasLayer(layer);
        const count = (layer && layer.getLayers) ? layer.getLayers().length : 0;
        const hasData = count > 0;

        const div = document.createElement('div');
        div.className = `legend-item ${isVisible ? '' : 'inactive'} ${hasData ? '' : 'no-data'}`;
        div.innerHTML = `
            <div class="legend-color" style="background: ${info.color}"></div>
            <span class="legend-label">${info.name} <span class="tw-text-[10px] tw-opacity-60">(${count})</span></span>
        `;
        container.appendChild(div);
    });

    if (activeCount > 0) legend.classList.remove('hidden');
    else legend.classList.add('hidden');
};

window.updateLateralControl = function () {
    const ctrl = document.getElementById('lateralLayerControl');
    if (!ctrl) return;

    let count = 0;
    ctrl.innerHTML = '';

    Object.keys(clippedLayers).forEach(key => {
        const info = LAYER_CONFIG[key];
        if (!info) return;
        const layer = clippedLayers[key];
        const isVisible = map.hasLayer(layer);
        const featureCount = (layer && layer.getLayers) ? layer.getLayers().length : 0;
        const hasData = featureCount > 0;
        count++;

        const div = document.createElement('div');
        div.className = `lateral-item ${isVisible ? '' : 'inactive'} ${hasData ? '' : 'no-data'}`;
        div.onclick = () => {
            if (hasData) window.toggleLayerVisibility(key, !isVisible);
            else showAlert(`${info.name} no tiene hallazgos en esta área.`, 'info');
        };
        div.innerHTML = `
            ${(isVisible && hasData) ? '<div class="lateral-badge"></div>' : ''}
            <div class="lateral-dot" style="background: ${info.color}">
                <span class="material-symbols-outlined">${info.icon || 'layers'}</span>
            </div>
            <span class="tw-text-[8px] tw-font-black tw-text-gray-400 tw-mt-1">${featureCount}</span>
        `;
        ctrl.appendChild(div);
    });

    if (count > 0) ctrl.classList.remove('hidden');
    else ctrl.classList.add('hidden');
};

function clearAnalysisLayers() {
    Object.values(clippedLayers).forEach(layer => map.removeLayer(layer));
    clippedLayers = {};
    if (clippedLocIndigenasLayer) map.removeLayer(clippedLocIndigenasLayer);
    if (clippedRutaWixarikaLayer) map.removeLayer(clippedRutaWixarikaLayer);
    if (clippedLocalitiesLayer) map.removeLayer(clippedLocalitiesLayer);
    if (clippedPointsLayer) map.removeLayer(clippedPointsLayer);
}


function processKmlFile(file) {
    if (!file) return;
    showPreloader('Cargando y procesando KML...');
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            if (!window.toGeoJSON) throw new Error("Librería de KML no cargada.");
            const kmlDom = new DOMParser().parseFromString(e.target.result, 'text/xml');
            const gj = toGeoJSON.kml(kmlDom);
            const polys = (gj.features || []).filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));

            if (polys.length === 0) {
                showAlert('El KML no contiene polígonos de área.', 'warning');
                return;
            }

            kmlGeoJson = { type: 'FeatureCollection', features: [polys[0]] };
            if (kmlLayer) map.removeLayer(kmlLayer);
            kmlLayer = L.geoJSON(kmlGeoJson, { style: { color: '#B8860B', weight: 4, fillOpacity: 0.15 } }).addTo(map);
            map.fitBounds(kmlLayer.getBounds(), { padding: [50, 50] });

            // Calcular métricas del KML
            calculateKmlMetrics(file.name, polys[0]);

            showAlert('KML visualizado.', 'success');
            hidePreloader();

            if (analysisMode === 'auto') {
                if (window.controlModal) window.controlModal.hide(); // Ocultar modal automáticamente
                performClipping(); // Disparo automático si el modo es 'auto'
            } else {
                showAlert('Modo Manual: Selecciona las capas y ejecuta el análisis.', 'info');
            }
        } catch (err) {
            console.error(err);
            showAlert('Error KML: ' + err.message, 'danger');
            hidePreloader(); // Ocultar preloader en caso de error
        }
    };
    reader.readAsText(file);
}

/**
 * Calcula métricas del polígono KML cargado
 */
function calculateKmlMetrics(fileName, feature) {
    try {
        const T = window.turf;
        if (!T || !feature) return;

        // Información básica
        kmlMetrics.fileName = fileName;
        kmlMetrics.uploadDate = new Date().toISOString();
        kmlMetrics.geometryType = feature.geometry.type;

        // Calcular área en km²
        const areaM2 = T.area(feature);
        kmlMetrics.area = (areaM2 / 1000000).toFixed(2); // Convertir a km²

        // Calcular perímetro en km
        let perimeterM = 0;
        if (feature.geometry.type === 'Polygon') {
            const line = T.lineString(feature.geometry.coordinates[0]);
            perimeterM = T.length(line, { units: 'meters' });
        } else if (feature.geometry.type === 'MultiPolygon') {
            feature.geometry.coordinates.forEach(polygon => {
                const line = T.lineString(polygon[0]);
                perimeterM += T.length(line, { units: 'meters' });
            });
        }
        kmlMetrics.perimeter = (perimeterM / 1000).toFixed(2); // Convertir a km

        // Calcular centroide
        const center = T.centroid(feature);
        kmlMetrics.centroid = {
            lat: center.geometry.coordinates[1].toFixed(6),
            lng: center.geometry.coordinates[0].toFixed(6)
        };

        // Calcular bounds
        const bbox = T.bbox(feature);
        kmlMetrics.bounds = {
            west: bbox[0].toFixed(6),
            south: bbox[1].toFixed(6),
            east: bbox[2].toFixed(6),
            north: bbox[3].toFixed(6)
        };

        // Contar vértices
        let vertexCount = 0;
        if (feature.geometry.type === 'Polygon') {
            vertexCount = feature.geometry.coordinates[0].length;
        } else if (feature.geometry.type === 'MultiPolygon') {
            feature.geometry.coordinates.forEach(polygon => {
                vertexCount += polygon[0].length;
            });
        }
        kmlMetrics.vertexCount = vertexCount;

        console.log('[KML Metrics]', kmlMetrics);
    } catch (error) {
        console.error('Error calculando métricas del KML:', error);
    }
}

async function performClipping() {
    if (!kmlGeoJson) { showAlert('Primero carga un archivo KML', 'info'); return; }
    showPreloader('Preparando análisis...');
    await new Promise(r => setTimeout(r, 100)); // Ceder al loop para pintar preloader
    try {
        const clipArea = kmlGeoJson.features[0];

        // Limpieza previa
        [clippedAtlasLayer, clippedRegionesLayer, clippedLenguasLayer, clippedLocIndigenasLayer, clippedRutaWixarikaLayer].forEach(l => { if (l && map) map.removeLayer(l); });

        const stylePoint = (color) => ({
            pointToLayer: (f, latlng) => L.circleMarker(latlng, {
                radius: 7,
                fillColor: color,
                color: '#fff',
                weight: 3,
                fillOpacity: 1,
                className: 'premium-marker'
            })
        });
        const stylePoly = (color) => ({ style: { color, weight: 3, fillOpacity: 0.2, dashArray: '5, 5' } });
        const isChecked = (id) => document.querySelector(`input[value="${id}"]`)?.checked;

        // Validación: Al menos una capa seleccionada
        if (analysisMode === 'manual') {
            const selectedLayers = Array.from(document.querySelectorAll('#layerOptions input[type="checkbox"]')).filter(i => i.checked);
            if (selectedLayers.length === 0) {
                showAlert('Selecciona al menos una capa para el análisis.', 'warning');
                hidePreloader();
                return;
            }
            if (window.controlModal) window.controlModal.hide(); // Ocultar al iniciar manual
        }

        currentAnalysisResults = {}; // Inicializar variable global para el reporte

        const tasks = [
            {
                id: 'atlas', callback: async () => {
                    if (analysisMode === 'auto' || isChecked('atlas')) {
                        const r = clipLayer(
                            await getLayerData('atlas'),
                            stylePoint('#ff00ff'),
                            (p) => formatPopupAllProperties('Atlas Indígena', p),
                            clipArea,
                            (p) => p.Localidad || p.NOM_LOC || 'Punto de Atlas'
                        );
                        clippedAtlasLayer = r.layer.addTo(map); currentAnalysisResults.atlas = r.clipped;
                    }
                }
            },
            {
                id: 'regiones', callback: async () => {
                    if (analysisMode === 'auto' || isChecked('regiones')) {
                        const r = clipLayer(await getLayerData('regiones'), stylePoly('#ffa500'), (p) => formatPopupAllProperties('Región Indígena', p), clipArea);
                        clippedRegionesLayer = r.layer.addTo(map); currentAnalysisResults.regiones = r.clipped;
                    }
                }
            },
            {
                id: 'lenguas', callback: async () => {
                    if (analysisMode === 'auto' || isChecked('lenguas')) {
                        const r = clipLayer(await getLayerData('lenguas'), stylePoint('#00ffff'), (p) => formatPopupAllProperties('Lengua Indígena', p), clipArea);
                        clippedLenguasLayer = r.layer.addTo(map); currentAnalysisResults.lenguas = r.clipped;
                    }
                }
            },
            {
                id: 'loc_ind', callback: async () => {
                    if (analysisMode === 'auto' || isChecked('loc_ind')) {
                        const r = clipLayer(await getLayerData('loc_indigenas_datos'), stylePoint('#8000ff'), (p) => formatPopupAllProperties('Localidad Indígena', p), clipArea); // Changed data source and popup title
                        clippedLocIndigenasLayer = r.layer.addTo(map); currentAnalysisResults.loc_ind = r.clipped;
                    }
                }
            },
            {
                id: 'ruta', callback: async () => {
                    if (analysisMode === 'auto' || isChecked('ruta')) {
                        const r = clipLayer(await getLayerData('rutaWixarika'), stylePoly('#ff8000'), (p) => formatPopupAllProperties('Ruta Wixárika', p), clipArea); // Changed popup title
                        clippedRutaWixarikaLayer = r.layer.addTo(map); currentAnalysisResults.ruta = r.clipped;
                    }
                }
            },
            {
                id: 'localidades', callback: async () => {
                    if (analysisMode === 'auto' || isChecked('localidades')) {
                        const r = clipLayer(await getLayerData('localidades'), stylePoly('#3b82f6'), (p) => formatPopupAllProperties('Localidad (Polígonos)', p), clipArea);
                        clippedLocalitiesLayer = r.layer.addTo(map); currentAnalysisResults.localidades = r.clipped;
                    }
                }
            },
            {
                id: 'puntos', callback: async () => {
                    if (analysisMode === 'auto' || isChecked('puntos')) {
                        const r = clipLayer(await getLayerData('localities_points'), stylePoint('#10b981'), (p) => formatPopupAllProperties('Localidad (Puntos)', p), clipArea);
                        clippedPointsLayer = r.layer.addTo(map); currentAnalysisResults.puntos = r.clipped;
                    }
                }
            }
        ];

        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            const progress = 10 + Math.round(((i + 1) / tasks.length) * 85);
            const layerName = LAYER_CONFIG[task.id]?.name || task.id;
            console.log(`[Clipping] Procesando tarea ${i + 1}/${tasks.length}: ${task.id}`);
            updatePreloader(`PROCESANDO: ${layerName.toUpperCase()}`, progress);
            await task.callback();
        }

        // Registrar capas para el control de visibilidad
        if (clippedAtlasLayer) clippedLayers.atlas = clippedAtlasLayer;
        if (clippedRegionesLayer) clippedLayers.regiones = clippedRegionesLayer;
        if (clippedLenguasLayer) clippedLayers.lenguas = clippedLenguasLayer;
        if (clippedLocIndigenasLayer) clippedLayers.loc_ind = clippedLocIndigenasLayer;
        if (clippedRutaWixarikaLayer) clippedLayers.ruta = clippedRutaWixarikaLayer;
        if (clippedLocalitiesLayer) clippedLayers.localidades = clippedLocalitiesLayer;
        if (clippedPointsLayer) clippedLayers.puntos = clippedPointsLayer;

        updateResultsPanel(currentAnalysisResults);
        updateLegend();
        updateLateralControl();
        showAlert('Análisis completado. Revisa los hallazgos en el panel inferior.', 'success');
    } catch (e) {
        console.error(e);
        showAlert('Error durante el análisis.', 'danger');
    } finally {
        hidePreloader();
    }
}

function clipLayer(data, styleOptions, popupFormatter, clipArea, tooltipFormatter) {
    const T = window.turf;
    if (!T || !clipArea || !data.features) return { clipped: [], layer: L.layerGroup() };
    const clipped = data.features.filter(f => {
        try { return T.booleanIntersects(f.geometry, clipArea.geometry); } catch (_) { return false; }
    });
    const layer = L.geoJSON(T.featureCollection(clipped), styleOptions);
    if (popupFormatter) layer.eachLayer(l => l.bindPopup(popupFormatter(l.feature.properties)));
    if (tooltipFormatter) {
        layer.eachLayer(l => {
            l.bindTooltip(tooltipFormatter(l.feature.properties), {
                direction: 'top',
                offset: [0, -10],
                className: 'tw-rounded-lg tw-bg-white tw-shadow-xl tw-border-0 tw-text-[9px] tw-font-black tw-text-gray-800'
            });
        });
    }
    return { clipped, layer };
}

window.updateLayersDisplay = function (data) {
    const container = document.getElementById('layersContainer');
    const badge = document.getElementById('totalFoundBadge');
    if (!container || !badge) return;

    container.innerHTML = '';
    let total = 0;

    Object.keys(data).forEach(key => {
        const findings = data[key];
        if (findings && findings.length > 0) {
            total += findings.length;
            const info = LAYER_CONFIG[key] || { name: key.toUpperCase(), color: '#6366f1', desc: 'Hallazgos' };

            const div = document.createElement('div');
            div.className = 'tw-flex tw-items-center tw-justify-between tw-p-3 tw-bg-gray-50 tw-rounded-xl tw-border tw-border-gray-100';
            div.innerHTML = `
                <div class="tw-flex tw-items-center tw-gap-3">
                    <div class="tw-w-2 tw-h-2 tw-rounded-full" style="background-color: ${info.color}"></div>
                    <div>
                        <div class="tw-text-[10px] tw-font-black tw-text-gray-800 tw-uppercase">${info.name}</div>
                        <div class="tw-text-[9px] tw-text-gray-400 tw-font-bold">${findings.length} ${findings.length === 1 ? 'ELEMENTO' : 'ELEMENTOS'}</div>
                    </div>
                </div>
                <div class="tw-flex tw-items-center tw-gap-3">
                    <button onclick="window.zoomToLayer('${key}')" class="tw-w-8 tw-h-8 tw-rounded-lg tw-bg-white tw-border tw-border-gray-100 tw-flex tw-items-center tw-justify-center hover:tw-bg-gray-100 tw-transition-colors">
                        <span class="material-symbols-outlined tw-text-[16px] tw-text-gray-400">zoom_in</span>
                    </button>
                    <label class="layer-toggle-mini">
                        <input type="checkbox" checked onchange="window.toggleLayerVisibility('${key}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            `;
            container.appendChild(div);
        }
    });

    badge.textContent = `${total} IMPACTOS`;
    badge.className = total > 0 ?
        'tw-bg-emerald-100 tw-text-emerald-700 tw-text-[10px] tw-font-bold tw-px-2 tw-py-0.5 tw-rounded-full' :
        'tw-bg-gray-100 tw-text-gray-400 tw-text-[10px] tw-font-bold tw-px-2 tw-py-0.5 tw-rounded-full';

    const dBtn = document.getElementById('downloadReportBtn');
    if (dBtn) dBtn.disabled = (total === 0);

    // No mostrar alert automático aquí, se maneja en updateResultsPanel
}

window.zoomToLayer = function (key) {
    const layers = {
        atlas: clippedAtlasLayer,
        regiones: clippedRegionesLayer,
        lenguas: clippedLenguasLayer,
        loc_ind: clippedLocIndigenasLayer,
        ruta: clippedRutaWixarikaLayer,
        localidades: clippedLocalitiesLayer,
        puntos: clippedPointsLayer
    };
    const l = layers[key];
    if (l && l.getBounds().isValid()) {
        map.fitBounds(l.getBounds(), { padding: [40, 40] });
    }
};

window.generateExcelReport = function () {
    if (!currentAnalysisResults || Object.keys(currentAnalysisResults).length === 0) {
        showAlert('No hay resultados para descargar.', 'warning');
        return;
    }

    showPreloader('Generando reporte Excel...');

    try {
        const wb = XLSX.utils.book_new();
        let hasData = false;
        let totalFeatures = 0;

        // Crear hoja de resumen
        const summaryData = [];
        summaryData.push(['REPORTE DE ANÁLISIS DE IMPACTO INDÍGENA']);
        summaryData.push(['Fecha de Generación:', new Date().toLocaleString('es-MX')]);
        summaryData.push([]);
        summaryData.push(['Capa', 'Elementos Encontrados']);

        Object.entries(currentAnalysisResults).forEach(([key, features]) => {
            if (!features || features.length === 0) return;
            const info = LAYER_CONFIG[key] || { name: key };
            summaryData.push([info.name, features.length]);
            totalFeatures += features.length;
            hasData = true;
        });

        summaryData.push([]);
        summaryData.push(['TOTAL DE IMPACTOS:', totalFeatures]);

        const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, summaryWs, 'Resumen');

        // Crear hojas por cada capa con datos
        Object.entries(currentAnalysisResults).forEach(([key, features]) => {
            if (!features || features.length === 0) return;

            const info = LAYER_CONFIG[key] || { name: key };
            const dataForSheet = features.map((f, index) => {
                // Aplanar propiedades y añadir coordenadas del centroide si es posible
                const props = {
                    'No.': index + 1,
                    ...f.properties
                };

                // Intentar añadir lat/lng
                if (f.geometry) {
                    if (f.geometry.type === 'Point') {
                        props['Latitud'] = f.geometry.coordinates[1].toFixed(6);
                        props['Longitud'] = f.geometry.coordinates[0].toFixed(6);
                    } else if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
                        // Calcular centroide usando turf si está disponible
                        try {
                            const centroid = turf.centroid(f);
                            props['Centroide_Lat'] = centroid.geometry.coordinates[1].toFixed(6);
                            props['Centroide_Lng'] = centroid.geometry.coordinates[0].toFixed(6);
                        } catch (e) {
                            console.warn('No se pudo calcular centroide:', e);
                        }
                    }
                }
                return props;
            });

            const ws = XLSX.utils.json_to_sheet(dataForSheet);

            // Ajustar ancho de columnas
            const cols = Object.keys(dataForSheet[0] || {}).map(key => ({
                wch: Math.min(Math.max(key.length, 10), 30)
            }));
            ws['!cols'] = cols;

            XLSX.utils.book_append_sheet(wb, ws, info.name.substring(0, 30)); // Nombre max 31 chars
        });

        if (hasData) {
            const dateStr = new Date().toISOString().slice(0, 10);
            const timeStr = new Date().toTimeString().slice(0, 5).replace(':', '');
            XLSX.writeFile(wb, `Reporte_Hallazgos_${dateStr}_${timeStr}.xlsx`);
            hidePreloader();
            showAlert(`Reporte descargado: ${totalFeatures} elementos en ${Object.keys(currentAnalysisResults).length} capas.`, 'success');
        } else {
            hidePreloader();
            showAlert('El análisis no arrojó hallazgos.', 'info');
        }
    } catch (error) {
        console.error('Error generando Excel:', error);
        hidePreloader();
        showAlert('Error al generar el archivo Excel: ' + error.message, 'danger');
    }
};

function initApp() {
    initMap();

    const kInput = document.getElementById('kmlFile');
    const aBtn = document.getElementById('uploadKmlBtn');
    const cBtn = document.getElementById('clearMap');
    const fBtn = document.getElementById('openControl');
    const downloadBtn = document.getElementById('downloadReportBtn');

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => window.generateExcelReport());
    }

    fBtn?.addEventListener('click', () => {
        const mEl = document.getElementById('controlModal');
        if (mEl && window.bootstrap) {
            bootstrap.Modal.getOrCreateInstance(mEl).show();
        }
    });

    // Event Listeners
    kInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('fileNameLabel').textContent = file.name.toUpperCase();
            aBtn.disabled = false;
            processKmlFile(file);
        }
    });

    aBtn?.addEventListener('click', () => {
        if (kmlGeoJson) {
            performClipping();
        } else {
            showAlert('Carga un archivo KML primero.', 'warning');
        }
    });

    cBtn?.addEventListener('click', () => {
        [kmlLayer, clippedAtlasLayer, clippedRegionesLayer, clippedLenguasLayer, clippedLocIndigenasLayer, clippedRutaWixarikaLayer, clippedLocalitiesLayer, clippedPointsLayer].forEach(l => { if (l && map) map.removeLayer(l); });
        kmlGeoJson = null;
        if (kInput) kInput.value = '';
        const nameLabel = document.getElementById('fileNameLabel');
        if (nameLabel) nameLabel.textContent = 'SELECCIONAR ARCHIVO';
        aBtn.disabled = true;
        document.getElementById('bottomResultsPanel')?.classList.remove('active');
        document.getElementById('mapLegend')?.classList.add('hidden');
        document.getElementById('lateralLayerControl')?.classList.add('hidden');
        showAlert('Mapa y datos reseteados', 'info');
    });

    // Auto-open con Bootstrap instance
    setTimeout(() => {
        const mEl = document.getElementById('controlModal');
        if (mEl && window.bootstrap) {
            window.controlModal = bootstrap.Modal.getOrCreateInstance(mEl);
            window.controlModal.show();
        }
    }, 1200);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// ===== FUNCIONES DEL MODAL DE RESULTADOS =====
let currentModalData = null;
let currentActiveFilter = null;
let currentPage = 1;
const ITEMS_PER_PAGE = 50;

function openResultsModal() {
    if (!currentAnalysisResults) {
        showAlert('No hay resultados disponibles', 'warning');
        return;
    }

    const modalEl = document.getElementById('resultsModal');
    if (!modalEl) return;

    currentModalData = processDataForModal(currentAnalysisResults);
    modalEl.classList.add('active');
    renderModalContent(currentModalData);
}

function closeResultsModal() {
    const modalEl = document.getElementById('resultsModal');
    if (modalEl) {
        modalEl.classList.remove('active');
        currentModalData = null;
        currentActiveFilter = null;
    }
}

function processDataForModal(data) {
    const processed = {};
    const iconMap = {
        atlas: 'groups',
        regiones: 'public',
        lenguas: 'translate',
        loc_ind: 'groups',
        ruta: 'route',
        localidades: 'pin_drop',
        puntos: 'pin_drop'
    };

    Object.entries(data).forEach(([key, value]) => {
        // currentAnalysisResults tiene features directamente como array
        if (value && Array.isArray(value) && value.length > 0) {
            processed[key] = {
                title: LAYER_CONFIG[key]?.name || key,
                icon: iconMap[key] || 'layers',
                features: value,
                layerName: key
            };
        }
    });

    return processed;
}

function renderModalContent(data) {
    const totalElements = Object.values(data).reduce((sum, layer) => sum + layer.features.length, 0);

    const countEl = document.getElementById('totalElementsCount');
    if (countEl) {
        const totalFormatted = totalElements.toLocaleString('es-MX');
        countEl.textContent = `${totalFormatted} REGISTROS ENCONTRADOS`;
    }

    // Establecer el primer elemento como activo ANTES de renderizar los filtros
    const firstLayerKey = Object.keys(data)[0];
    if (firstLayerKey) {
        currentActiveFilter = firstLayerKey;
    }

    renderLayerFilters(data);

    if (firstLayerKey) {
        showLayerResults(firstLayerKey, data[firstLayerKey]);
    }
}

function renderLayerFilters(data) {
    const filtersContainer = document.getElementById('layerFilters');
    if (!filtersContainer) return;

    filtersContainer.innerHTML = '';

    Object.entries(data).forEach(([layerKey, layerData]) => {
        const button = document.createElement('button');
        const isActive = currentActiveFilter === layerKey;

        // Estilos inline para garantizar el color guinda - añadido white-space: nowrap
        if (isActive) {
            button.style.cssText = 'flex-shrink: 0; white-space: nowrap; display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 700; font-size: 0.75rem; transition: all 0.2s; background: #fdf2f4; color: #800020; border: 1px solid #f4cfd7; cursor: pointer;';
        } else {
            button.style.cssText = 'flex-shrink: 0; white-space: nowrap; display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 700; font-size: 0.75rem; transition: all 0.2s; background: #f8fafc; color: #64748b; border: 1px solid transparent; cursor: pointer;';
        }

        const badgeStyle = isActive
            ? 'background: #800020; color: white; padding: 0.125rem 0.375rem; border-radius: 0.375rem; font-size: 10px; font-weight: 700;'
            : 'background: #e2e8f0; color: #64748b; padding: 0.125rem 0.375rem; border-radius: 0.375rem; font-size: 10px; font-weight: 700;';

        const countFormatted = layerData.features.length.toLocaleString('es-MX');

        button.innerHTML = `
            <span class="material-symbols-outlined" style="font-size: 1rem;">${layerData.icon}</span>
            <span>${layerData.title.toUpperCase()}</span>
            <span style="${badgeStyle}">${countFormatted}</span>
        `;

        button.addEventListener('click', () => {
            currentActiveFilter = layerKey;
            currentPage = 1; // Resetear página al cambiar de capa
            renderLayerFilters(data);
            showLayerResults(layerKey, layerData);
        });

        // Hover effects
        if (!isActive) {
            button.addEventListener('mouseenter', () => {
                button.style.background = '#f1f5f9';
            });
            button.addEventListener('mouseleave', () => {
                button.style.background = '#f8fafc';
            });
        }

        filtersContainer.appendChild(button);
    });
}

function showLayerResults(layerKey, layerData) {
    const container = document.getElementById('layerResultsContainer');
    if (!container) return;

    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <div style="width: 0.25rem; height: 1rem; background: #800020; border-radius: 9999px;"></div>
                <h2 style="color: #1e293b; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">
                    Resultados de Consulta
                </h2>
            </div>
        </div>
    `;

    html += renderTableForLayer(layerData.features, layerKey);
    container.innerHTML = html;
}

function renderTableForLayer(features, layerKey) {
    if (features.length === 0) {
        return '<p style="color: #94a3b8; font-size: 0.875rem;">No hay datos disponibles.</p>';
    }

    const firstProps = features[0].properties;
    const columns = Object.keys(firstProps).slice(0, 5);

    // Calcular paginación
    const totalPages = Math.ceil(features.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, features.length);
    const currentFeatures = features.slice(startIndex, endIndex);

    // Función helper para formatear números con separador de miles
    const formatNumber = (value) => {
        if (typeof value === 'number') {
            return value.toLocaleString('es-MX');
        }
        // Si es string que parece número, intentar convertir
        if (typeof value === 'string' && !isNaN(value) && value.trim() !== '') {
            const num = parseFloat(value);
            return num.toLocaleString('es-MX');
        }
        return value;
    };

    let html = `
        <div style="overflow-x: auto; border-radius: 0.5rem; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
            <table style="width: 100%; text-align: left; font-size: 11px;">
                <thead>
                    <tr style="background: #f8fafc; color: #64748b; font-weight: 700; border-bottom: 1px solid #e2e8f0;">
    `;

    columns.forEach(col => {
        html += `<th style="text-transform: uppercase; letter-spacing: -0.025em; padding: 0.5rem 0.75rem;">${col}</th>`;
    });

    html += `</tr></thead><tbody style="border-color: #f1f5f9;">`;

    currentFeatures.forEach((feature, index) => {
        const props = feature.properties;
        const bgColor = index % 2 === 0 ? '#ffffff' : '#f8fafc';
        const featureJson = JSON.stringify(feature).replace(/"/g, '&quot;');
        html += `<tr style="color: #334155; background: ${bgColor}; cursor: pointer; transition: all 0.2s; border-bottom: 1px solid #f1f5f9;" 
            onmouseover="this.style.background='#fef2f2'; this.style.borderLeft='4px solid #800020'; this.style.paddingLeft='0.5rem';" 
            onmouseout="this.style.background='${bgColor}'; this.style.borderLeft='none'; this.style.paddingLeft='0';" 
            onclick='zoomToFeatureFromModal(${featureJson}, "${layerKey}")'>`;

        columns.forEach((col, colIndex) => {
            let value = props[col] !== undefined ? props[col] : '-';
            value = formatNumber(value);
            const fontWeight = colIndex === 0 ? 'font-weight: 500;' : '';
            html += `<td style="padding: 0.5rem 0.75rem; ${fontWeight}">${value}</td>`;
        });

        html += `</tr>`;
    });

    html += `</tbody></table></div>`;

    // Controles de paginación
    if (totalPages > 1) {
        const totalFormatted = features.length.toLocaleString('es-MX');
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; padding: 0 0.25rem;">
                <p style="font-size: 0.75rem; color: #64748b; font-weight: 600;">
                    Mostrando ${startIndex + 1}-${endIndex} de ${totalFormatted} resultados
                </p>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <button 
                        onclick="changePage(${currentPage - 1}, '${layerKey}')"
                        ${currentPage === 1 ? 'disabled' : ''}
                        style="padding: 0.375rem 0.75rem; background: ${currentPage === 1 ? '#e2e8f0' : '#800020'}; color: ${currentPage === 1 ? '#94a3b8' : 'white'}; border: none; border-radius: 0.375rem; font-size: 0.75rem; font-weight: 700; cursor: ${currentPage === 1 ? 'not-allowed' : 'pointer'}; transition: all 0.2s;"
                        ${currentPage === 1 ? '' : "onmouseover=\"this.style.background='#600018'\" onmouseout=\"this.style.background='#800020'\""}>
                        ◀ Anterior
                    </button>
                    <span style="font-size: 0.75rem; color: #334155; font-weight: 700; padding: 0 0.5rem;">
                        Página ${currentPage} de ${totalPages}
                    </span>
                    <button 
                        onclick="changePage(${currentPage + 1}, '${layerKey}')"
                        ${currentPage === totalPages ? 'disabled' : ''}
                        style="padding: 0.375rem 0.75rem; background: ${currentPage === totalPages ? '#e2e8f0' : '#800020'}; color: ${currentPage === totalPages ? '#94a3b8' : 'white'}; border: none; border-radius: 0.375rem; font-size: 0.75rem; font-weight: 700; cursor: ${currentPage === totalPages ? 'not-allowed' : 'pointer'}; transition: all 0.2s;"
                        ${currentPage === totalPages ? '' : "onmouseover=\"this.style.background='#600018'\" onmouseout=\"this.style.background='#800020'\""}>
                        Siguiente ▶
                    </button>
                </div>
            </div>
        `;
    }

    return html;
}

function changePage(newPage, layerKey) {
    currentPage = newPage;
    const layerData = currentModalData[layerKey];
    if (layerData) {
        showLayerResults(layerKey, layerData);
    }
}

function downloadModalExcel() {
    if (!currentModalData || Object.keys(currentModalData).length === 0) {
        showAlert('No hay datos disponibles para descargar', 'warning');
        return;
    }

    try {
        const wb = XLSX.utils.book_new();
        let totalFeatures = 0;

        // HOJA 1: Información General del Polígono
        const generalInfo = [
            { Campo: 'Tipo de Análisis', Valor: 'Análisis de Impacto' },
            { Campo: 'Versión del Sistema', Valor: 'V0 - Básico Indígena' },
            { Campo: 'Nombre del Archivo', Valor: kmlMetrics.fileName || 'N/A' },
            { Campo: 'Fecha de Análisis', Valor: kmlMetrics.uploadDate ? new Date(kmlMetrics.uploadDate).toLocaleString('es-MX') : 'N/A' },
            { Campo: 'Tipo de Geometría', Valor: kmlMetrics.geometryType || 'N/A' },
            { Campo: 'Área (km²)', Valor: kmlMetrics.area || 0 },
            { Campo: 'Perímetro (km)', Valor: kmlMetrics.perimeter || 0 },
            { Campo: 'Número de Vértices', Valor: kmlMetrics.vertexCount || 0 },
            { Campo: 'Centroide (Latitud)', Valor: kmlMetrics.centroid?.lat || 'N/A' },
            { Campo: 'Centroide (Longitud)', Valor: kmlMetrics.centroid?.lng || 'N/A' },
            { Campo: 'Límite Norte', Valor: kmlMetrics.bounds?.north || 'N/A' },
            { Campo: 'Límite Sur', Valor: kmlMetrics.bounds?.south || 'N/A' },
            { Campo: 'Límite Este', Valor: kmlMetrics.bounds?.east || 'N/A' },
            { Campo: 'Límite Oeste', Valor: kmlMetrics.bounds?.west || 'N/A' },
            { Campo: 'Total de Capas Analizadas', Valor: Object.keys(currentModalData).length },
            { Campo: 'Total de Elementos Encontrados', Valor: Object.values(currentModalData).reduce((sum, layer) => sum + layer.features.length, 0) }
        ];
        const wsGeneral = XLSX.utils.json_to_sheet(generalInfo);
        XLSX.utils.book_append_sheet(wb, wsGeneral, '00_Info_General');

        // HOJAS 2+: Una hoja por cada capa
        Object.entries(currentModalData).forEach(([layerKey, layerData]) => {
            if (layerData.features && layerData.features.length > 0) {
                const data = layerData.features.map(f => f.properties);
                const ws = XLSX.utils.json_to_sheet(data);

                // Nombre de hoja válido (máximo 31 caracteres)
                const sheetName = layerData.title.substring(0, 31);
                XLSX.utils.book_append_sheet(wb, ws, sheetName);
                totalFeatures += layerData.features.length;
            }
        });

        // Generar nombre de archivo con fecha
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
        const fileName = `Hallazgos_${dateStr}_${timeStr}.xlsx`;

        // Descargar archivo
        XLSX.writeFile(wb, fileName);

        const totalFormatted = totalFeatures.toLocaleString('es-MX');
        const layersCount = Object.keys(currentModalData).length;
        showAlert(`Excel descargado: ${totalFormatted} elementos en ${layersCount} capas + Info General`, 'success');
    } catch (error) {
        console.error('Error al generar Excel:', error);
        showAlert('Error al generar el archivo Excel', 'danger');
    }
}

/**
 * Exporta el mapa actual como imagen PNG de alta resolución con leyenda
 */
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
            // Usar html2canvas para capturar el mapa completo con todas las capas
            html2canvas(mapContainer, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                scale: 2, // 2x resolución para mejor calidad
                logging: false,
                imageTimeout: 0,
                onclone: function (clonedDoc) {
                    // Asegurar que el mapa clonado tenga el mismo tamaño
                    const clonedMap = clonedDoc.getElementById('map');
                    if (clonedMap) {
                        clonedMap.style.width = mapContainer.offsetWidth + 'px';
                        clonedMap.style.height = mapContainer.offsetHeight + 'px';
                    }
                }
            }).then(function (canvas) {
                // Crear canvas compuesto para agregar leyenda y metadatos
                const finalCanvas = document.createElement('canvas');
                finalCanvas.width = canvas.width;
                finalCanvas.height = canvas.height;
                const ctx = finalCanvas.getContext('2d');

                // Dibujar el mapa base
                ctx.drawImage(canvas, 0, 0);

                // Obtener información de la leyenda para dibujarla
                if (legend && !legend.classList.contains('hidden')) {
                    const legendItems = legend.querySelectorAll('.legend-item');
                    if (legendItems.length > 0) {
                        // Calcular dimensiones de la leyenda
                        const scale = 2; // Para mantener consistencia con la escala del mapa
                        const legendPadding = 15 * scale;
                        const legendItemHeight = 28 * scale;
                        const legendWidth = 250 * scale;
                        const legendHeight = (legendItems.length * legendItemHeight) + (legendPadding * 2) + (30 * scale);

                        // Posición de la leyenda (esquina superior derecha)
                        const legendX = canvas.width - legendWidth - (20 * scale);
                        const legendY = 20 * scale;

                        // Fondo de la leyenda con transparencia
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
                        ctx.shadowBlur = 10 * scale;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 2 * scale;
                        ctx.beginPath();
                        ctx.roundRect(legendX, legendY, legendWidth, legendHeight, 12 * scale);
                        ctx.fill();
                        ctx.shadowColor = 'transparent';
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetY = 0;

                        // Título de la leyenda
                        ctx.fillStyle = '#1e293b';
                        ctx.font = `bold ${14 * scale}px Inter, sans-serif`;
                        ctx.fillText('CAPAS', legendX + legendPadding, legendY + legendPadding + (14 * scale));

                        // Dibujar items de la leyenda
                        let yOffset = legendY + legendPadding + (35 * scale);
                        legendItems.forEach((item) => {
                            const colorElement = item.querySelector('.legend-color');
                            const labelElement = item.querySelector('.legend-label');
                            const countElement = item.querySelector('.legend-count');

                            if (colorElement && labelElement) {
                                const color = colorElement.style.background || colorElement.style.backgroundColor;
                                const label = labelElement.textContent;
                                const count = countElement ? countElement.textContent : '';

                                // Dibujar círculo de color
                                ctx.fillStyle = color;
                                ctx.beginPath();
                                ctx.arc(legendX + legendPadding + (8 * scale), yOffset, 6 * scale, 0, Math.PI * 2);
                                ctx.fill();

                                // Dibujar etiqueta
                                ctx.fillStyle = '#475569';
                                ctx.font = `${12 * scale}px Inter, sans-serif`;
                                ctx.fillText(label, legendX + legendPadding + (24 * scale), yOffset + (4 * scale));

                                // Dibujar contador
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

                // Dibujar cuadro de metadatos (esquina inferior izquierda)
                const scale = 2;
                const metaWidth = 400 * scale;
                const metaHeight = 90 * scale;
                const metaX = 20 * scale;
                const metaY = canvas.height - metaHeight - (20 * scale);
                const metaPadding = 16 * scale;

                // Fondo del cuadro de metadatos
                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
                ctx.shadowBlur = 10 * scale;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 2 * scale;
                ctx.beginPath();
                ctx.roundRect(metaX, metaY, metaWidth, metaHeight, 12 * scale);
                ctx.fill();
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetY = 0;

                // Título del análisis
                ctx.fillStyle = '#800020';
                ctx.font = `bold ${16 * scale}px Inter, sans-serif`;
                ctx.fillText('ANÁLISIS DE IMPACTO - V0', metaX + metaPadding, metaY + metaPadding + (14 * scale));

                // Información del archivo y fecha
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

                // Convertir canvas a blob y descargar
                finalCanvas.toBlob(function (blob) {
                    const now = new Date();
                    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
                    const fileName = `Mapa_Analisis_${dateStr}_${timeStr}.png`;

                    // Descargar
                    const link = document.createElement('a');
                    link.download = fileName;
                    link.href = URL.createObjectURL(blob);
                    link.click();
                    URL.revokeObjectURL(link.href);

                    // Restaurar vista original del usuario
                    map.setView(originalCenter, originalZoom, { animate: false });

                    // Restaurar estado de leyenda
                    if (legendWasHidden && legend) {
                        legend.classList.add('hidden');
                    }

                    hidePreloader();
                    showAlert('Mapa exportado con leyenda en alta resolución', 'success');
                }, 'image/png', 1.0);

            }).catch(function (error) {
                console.error('Error al capturar mapa con html2canvas:', error);

                // Restaurar vista original
                map.setView(originalCenter, originalZoom, { animate: false });
                if (legendWasHidden && legend) legend.classList.add('hidden');

                hidePreloader();
                showAlert('Error al exportar el mapa como imagen', 'danger');
            });
        };

        // Centrar el mapa en el KML completo ANTES de capturar
        if (kmlLayer && kmlLayer.getBounds) {
            const bounds = kmlLayer.getBounds();
            if (bounds && bounds.isValid()) {
                // Usar evento moveend para saber cuándo terminó de centrar
                const onMoveEnd = () => {
                    map.off('moveend', onMoveEnd);

                    // Esperar a que se carguen los tiles
                    const tilesLoaded = () => {
                        // Esperar un poco más para asegurar que todo está renderizado
                        setTimeout(captureMap, 800);
                    };

                    // Dar tiempo a que se carguen los tiles después del movimiento
                    setTimeout(tilesLoaded, 200);
                };

                map.once('moveend', onMoveEnd);

                // Centrar el mapa con animación desactivada para captura inmediata
                map.fitBounds(bounds, {
                    padding: [50, 50],
                    animate: false,
                    duration: 0
                });
            } else {
                // Si no hay bounds válidos, capturar de inmediato
                setTimeout(captureMap, 800);
            }
        } else {
            // Si no hay KML, capturar la vista actual
            setTimeout(captureMap, 800);
        }

    } catch (error) {
        console.error('Error al exportar mapa:', error);
        hidePreloader();
        showAlert('Error al exportar el mapa como imagen', 'danger');
    }
}

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
        // Calcular el centroide del polígono
        const geoJsonLayer = L.geoJSON(feature);
        center = geoJsonLayer.getBounds().getCenter();
    } else {
        showAlert('Tipo de geometría no soportado', 'warning');
        return;
    }

    // Centrar el mapa en el feature con zoom apropiado
    map.setView(center, 14, {
        animate: true,
        duration: 1
    });

    // Crear un marker temporal para resaltar el punto
    const marker = L.circleMarker(center, {
        radius: 12,
        fillColor: '#800020',
        color: '#fff',
        weight: 3,
        opacity: 1,
        fillOpacity: 0.6
    }).addTo(map);

    // Animación de pulso
    let pulseSize = 12;
    let growing = true;
    const pulseInterval = setInterval(() => {
        if (growing) {
            pulseSize += 0.5;
            if (pulseSize >= 18) growing = false;
        } else {
            pulseSize -= 0.5;
            if (pulseSize <= 12) growing = true;
        }
        marker.setRadius(pulseSize);
    }, 50);

    // Remover el marker después de 3 segundos
    setTimeout(() => {
        clearInterval(pulseInterval);
        map.removeLayer(marker);
    }, 3000);

    // Mostrar info del feature
    const featureName = feature.properties.LOCALIDAD || feature.properties.NOMGEO || feature.properties.nombre || 'Elemento seleccionado';
    showAlert(`Centrando en: ${featureName}`, 'success');
}

// Cerrar modal al hacer clic fuera
document.addEventListener('DOMContentLoaded', () => {
    const modalEl = document.getElementById('resultsModal');
    if (modalEl) {
        modalEl.addEventListener('click', (e) => {
            if (e.target.id === 'resultsModal') {
                closeResultsModal();
            }
        });
    }
});

// Cerrar con tecla ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modalEl = document.getElementById('resultsModal');
        if (modalEl && modalEl.classList.contains('active')) {
            closeResultsModal();
        }
    }
});
