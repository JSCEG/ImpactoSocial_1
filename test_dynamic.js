/**
 * TEST DYNAMIC - LÓGICA DE CARGA DINÁMICA DE CAPAS
 * ==================================================
 * Prototipo para validar la intersección KML -> Estados -> Cloudflare CDN
 */

// --- STATE BOUNDING BOXES (INDEX SPATIAL) ---
// Coordenadas aproximadas [minX, minY, maxX, maxY] para los 32 estados.
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

// --- CONFIGURACIÓN ---
const urls = {
    // URL Base para dinámica
    localidades_base: 'https://cdn.sassoapps.com/Gabvy/capas/',
    // URLs Estáticas
    puntos: 'https://cdn.sassoapps.com/Gabvy/localidades_puntos.geojson',
    loc_ind: 'https://cdn.sassoapps.com/Gabvy/localidadesdatos_solo_datos.json' // Ajuste según tu JSON de datos
};

const LAYER_CONFIG = {
    localidades: { name: 'Localidades (Pol)', color: '#3b82f6', icon: 'layers' },
    puntos: { name: 'Localidades (Pnt)', color: '#10b981', icon: 'location_on' },
};

// --- GLOBALS ---
let map;
let kmlLayers = new Map();
let activeKmlId = null;
let kmlCounter = 0;
const dataCache = new Map(); // Cache para archivos ya descargados (evita re-descarga)

// --- HELPERS ---
function showAlert(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `alert alert-${type} tw-fixed tw-bottom-20 tw-left-1/2 tw-transform -tw-translate-x-1/2 tw-z-[9999] tw-shadow-2xl tw-bg-white tw-border tw-border-gray-200 tw-rounded-lg tw-px-6 tw-py-3 tw-flex tw-items-center tw-gap-2 tw-animate-bounce`;
    if (type === 'success') toast.classList.add('tw-text-green-600');
    else if (type === 'danger') toast.classList.add('tw-text-red-600');
    else toast.classList.add('tw-text-blue-600');
    toast.innerHTML = `<span class="material-symbols-outlined">info</span> <span class="tw-font-bold tw-text-xs">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function showPreloader(msg) {
    document.getElementById('preloader').classList.add('active');
    document.getElementById('preloaderStatus').textContent = msg;
}
function hidePreloader() {
    document.getElementById('preloader').classList.remove('active');
}

// --- CORE: DYNAMIC LOADING LOGIC ---

/**
 * Función CLAVE: Determina qué estados intersecta el bounding box del KML
 * y descarga los archivos correspondientes.
 */
async function getDynamicLocalities(kmlBounds) {
    if (!kmlBounds) return { type: 'FeatureCollection', features: [] };

    // 1. Obtener coordenadas del bbox del KML [minX, minY, maxX, maxY]
    // Leaflet bounds: SouthWest (minY, minX), NorthEast (maxY, maxX)
    const kmlMinX = kmlBounds.getWest();
    const kmlMinY = kmlBounds.getSouth();
    const kmlMaxX = kmlBounds.getEast();
    const kmlMaxY = kmlBounds.getNorth();

    console.log(`[Dynamic] KML Bounds: [${kmlMinX}, ${kmlMinY}, ${kmlMaxX}, ${kmlMaxY}]`);

    // 2. Encontrar estados intersectados
    const intersectedStates = [];
    for (const [state, bbox] of Object.entries(STATE_BBOXES)) {
        // Intersección básica de rectángulos (AABB)
        // bbox = [minX, minY, maxX, maxY]
        if (kmlMaxX < bbox[0] || kmlMinX > bbox[2] || kmlMaxY < bbox[1] || kmlMinY > bbox[3]) {
            continue; // No intersección
        }
        intersectedStates.push(state);
    }

    if (intersectedStates.length === 0) {
        console.warn('[Dynamic] No states intersected!');
        return { type: 'FeatureCollection', features: [] };
    }

    console.log(`[Dynamic] Intersected States: ${intersectedStates.join(', ')}`);
    showAlert(`Cargando estados: ${intersectedStates.join(', ')}`, 'info');

    // 3. Descargar archivos (Parallell Fetch)
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
            dataCache.set(cacheKey, data); // Guardar en cache
            return data;
        } catch (e) {
            console.error(`[Dynamic] Error loading ${state}:`, e);
            showAlert(`Error cargando ${state}`, 'danger');
            return null;
        }
    });

    const results = await Promise.all(promises);

    // 4. Merge Features
    const allFeatures = [];
    results.forEach(gj => {
        if (gj && gj.features) {
            allFeatures.push(...gj.features);
        }
    });

    console.log(`[Dynamic] Total features merged: ${allFeatures.length}`);
    return { type: 'FeatureCollection', features: allFeatures };
}

// --- MAP & INIT ---

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([24.1, -102], 5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 18 }).addTo(map);
}

function initApp() {
    console.log('Iniciando initApp...');
    try {
        if (!window.L) { throw new Error('Leaflet L is not defined'); }

        initMap();
        console.log('Mapa inicializado');

        // Input
        const kInput = document.getElementById('kmlFile');
        if (kInput) {
            kInput.addEventListener('change', (e) => {
                console.log('File input change detected');
                Array.from(e.target.files).forEach(file => processKmlFile(file));
            });
        }

        const btn = document.getElementById('uploadKmlBtn');
        if (btn) btn.addEventListener('click', performClipping);

        document.getElementById('clearMap').addEventListener('click', () => location.reload());
        document.getElementById('clipTypeSelect').addEventListener('change', window.updateBufferVisualization);
        document.getElementById('customBufferInput').addEventListener('input', window.updateBufferVisualization);

        hidePreloader();
        console.log('Preloader ocultado');

    } catch (err) {
        console.error('Error en initApp:', err);
        alert('Error al iniciar mapa: ' + err.message);
        hidePreloader(); // Force hide
    }
}

// --- KML & ANALYSIS HANDLERS ---

function processKmlFile(file) {
    showPreloader('Analizando KML...');
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const kmlDom = new DOMParser().parseFromString(e.target.result, 'text/xml');
            const gj = toGeoJSON.kml(kmlDom);
            const polys = gj.features.filter(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');

            if (polys.length === 0) throw new Error('No polygons found');

            const id = `kml_${++kmlCounter}`;
            const color = '#FF0000';
            const layer = L.geoJSON(gj, { style: { color: color, dashArray: '5,5', fillOpacity: 0.1 } }).addTo(map);

            map.fitBounds(layer.getBounds());

            kmlLayers.set(id, {
                id, name: file.name, geojson: gj, layer,
                analysis: {}, clippedLayers: {}
            });

            // UI Update
            const list = document.getElementById('kmlListContainer');
            list.classList.remove('tw-hidden');
            const div = document.createElement('div');
            div.className = "tw-p-2 tw-bg-white tw-border tw-mb-1 tw-rounded tw-text-xs";
            div.textContent = file.name;
            list.appendChild(div);

            document.getElementById('uploadKmlBtn').disabled = false;
            showAlert(`KML Cargado: ${file.name}`, 'success');

            // Dibujar buffer inicial inmediatamente
            if (window.updateBufferVisualization) window.updateBufferVisualization();

        } catch (err) {
            console.error(err);
            showAlert(err.message, 'danger');
        } finally {
            hidePreloader();
        }
    };
    reader.readAsText(file);
}

async function performClipping() {
    if (kmlLayers.size === 0) return;

    showPreloader('Ejecutando Carga Dinámica...');

    // Obtenemos el bound global para simplificar el ejemplo
    // (En prod idealmente sería por cada KML, pero un bound global funciona para merge)
    let globalBounds = null;
    kmlLayers.forEach(d => {
        const b = d.layer.getBounds();
        if (!globalBounds) globalBounds = b;
        else globalBounds.extend(b);
    });

    try {
        // --- CONFIG REPLACED ---
        let bufferKm = 0;
        const clipSelect = document.getElementById('clipTypeSelect');
        const clipType = clipSelect ? clipSelect.value : 'exact';

        if (clipType === 'direct') bufferKm = 2;
        else if (clipType === 'indirect') bufferKm = 5;
        else if (clipType === 'custom') {
            bufferKm = parseFloat(document.getElementById('customBufferInput').value) || 0;
        }

        console.log(`[Dynamic] Buffer Mode: ${clipType} (${bufferKm} km)`);

        // --- AQUÍ ESTÁ LA MAGIA ---
        // 1. Carga Dinámica de Polígonos
        if (document.querySelector('input[value="localidades"]').checked) {
            const dynamicData = await getDynamicLocalities(globalBounds);

            if (dynamicData.features.length > 0) {
                kmlLayers.forEach(d => {
                    const T = window.turf;
                    // Usar feature con buffer calculado previamente en updateBufferVisualization
                    const clipFeature = d.currentBufferFeature || d.geojson.features[0];

                    const clipped = dynamicData.features.filter(f => {
                        try { return T.booleanIntersects(f, clipFeature); } catch (e) { return false; }
                    });

                    if (clipped.length > 0) {
                        const l = L.geoJSON(T.featureCollection(clipped), {
                            style: { color: '#3b82f6', weight: 1, fillOpacity: 0.4 },
                            onEachFeature: (f, l) => {
                                const p = f.properties;
                                l.bindPopup(`<b>${p.NOM_LOC || 'S/N'}</b><br>Pob: ${p.POBTOT || 0}`);
                            }
                        }).addTo(map);

                        d.clippedLayers['localidades'] = l;
                        d.analysis['localidades'] = clipped;
                    }
                });
            }
        }

        // 2. Carga Estática de Puntos (Comparativa)
        if (document.querySelector('input[value="puntos"]').checked) {
            const resp = await fetch(urls.puntos);
            const data = await resp.json();
            // (Logica de clip similar...)
        }

        showAlert('Análisis Completado', 'success');
        document.getElementById('floatingResultsBtn').classList.remove('tw-hidden');
        document.getElementById('floatingResultsBtn').classList.add('tw-flex');

        updateResultsBadge();

    } catch (e) {
        console.error(e);
        showAlert('Error en análisis', 'danger');
    } finally {
        hidePreloader();
    }
}

function updateResultsBadge() {
    let total = 0;
    kmlLayers.forEach(d => {
        Object.values(d.analysis).forEach(l => total += l.length);
    });
    document.getElementById('resultsBadgeCount').textContent = total;
}

// --- RESULTADOS & TABLE LOGIC ---

window.openResultsModal = function () {
    document.getElementById('resultsModal').classList.add('active');
    const container = document.getElementById('layerResultsContainer');

    // Validar si hay resultados
    let totalResults = 0;
    kmlLayers.forEach(d => {
        if (d.analysis['localidades']) totalResults += d.analysis['localidades'].length;
    });

    if (totalResults === 0) {
        container.innerHTML = `
            <div class="tw-h-full tw-flex tw-flex-col tw-items-center tw-justify-center tw-text-gray-300">
                <span class="material-symbols-outlined tw-text-6xl tw-mb-4">search_off</span>
                <p class="tw-text-sm tw-font-medium">No se encontraron localidades intersectadas.</p>
            </div>`;
        return;
    }

    // Generar Tabla
    let html = `
        <div class="tw-flex tw-justify-between tw-items-center tw-mb-4">
            <h3 class="tw-font-bold tw-text-primary tw-text-lg">Detalle de Localidades Encontradas</h3>
            <button onclick="downloadExcel()" 
                class="tw-bg-green-600 hover:tw-bg-green-700 tw-text-white tw-px-4 tw-py-2 tw-rounded-lg tw-text-xs tw-font-bold tw-uppercase tw-flex tw-items-center tw-gap-2 tw-shadow-md tw-transition-colors">
                <span class="material-symbols-outlined tw-text-sm">download</span>
                Descargar Excel
            </button>
        </div>
    `;

    kmlLayers.forEach(d => {
        const feats = d.analysis['localidades'];
        if (feats && feats.length > 0) {
            html += `<div class="tw-mb-6">
                <div class="tw-flex tw-items-center tw-gap-2 tw-mb-2">
                    <span class="material-symbols-outlined tw-text-primary">folder</span>
                    <h4 class="tw-font-bold tw-text-gray-700">Archivo KML: ${d.name} <span class="tw-text-xs tw-text-gray-400 tw-font-normal">(${feats.length} resultados)</span></h4>
                </div>
                
                <div class="tw-overflow-x-auto tw-border tw-border-gray-200 tw-rounded-lg tw-shadow-sm">
                    <table class="tw-w-full tw-text-left tw-border-collapse">
                        <thead class="tw-bg-gray-50 tw-text-xs tw-uppercase tw-text-gray-500 tw-font-bold">
                            <tr>
                                <th class="tw-px-4 tw-py-3 tw-border-b">#</th>
                                <th class="tw-px-4 tw-py-3 tw-border-b">CVEGEO_L</th>
                                <th class="tw-px-4 tw-py-3 tw-border-b">Nombre</th>
                                <th class="tw-px-4 tw-py-3 tw-border-b">Estado</th>
                                <th class="tw-px-4 tw-py-3 tw-border-b">Municipio</th>
                                <th class="tw-px-4 tw-py-3 tw-border-b">Ámbito</th>
                                <th class="tw-px-4 tw-py-3 tw-border-b">Pob. Total</th>
                                <th class="tw-px-4 tw-py-3 tw-border-b tw-text-blue-600">Pob. Mas</th>
                                <th class="tw-px-4 tw-py-3 tw-border-b tw-text-pink-600">Pob. Fem</th>
                            </tr>
                        </thead>
                        <tbody class="tw-text-xs tw-text-gray-700">`;

            feats.forEach((f, idx) => {
                const p = f.properties;
                const cvegeo = p.CVEGEO_L || p.cvegeo_l || p.CVEGEO || 'N/A';
                const nombre = p.NOM_LOC || p.nom_loc || 'Sin Nombre';
                const estado = p.NOM_ENT || p.nom_ent || 'N/A';
                const mun = p.NOM_MUN || p.nom_mun || 'N/A';
                const ambito = p.AMBITO || p.ambito || 'N/A';
                const pob = parseInt(p.POBTOT || p.pobtot || 0);
                const pobMas = parseInt(p.POBMAS || p.pobmas || 0);
                const pobFem = parseInt(p.POBFEM || p.pobfem || 0);

                html += `
                    <tr onclick="zoomToLocality('${d.id}', ${idx})" class="hover:tw-bg-gray-100 tw-cursor-pointer tw-transition-colors tw-border-b last:tw-border-0" title="Ver en mapa">
                        <td class="tw-px-4 tw-py-2 tw-font-bold tw-text-gray-400">${idx + 1}</td>
                        <td class="tw-px-4 tw-py-2 tw-font-mono tw-text-primary">${cvegeo}</td>
                        <td class="tw-px-4 tw-py-2 tw-font-bold">${nombre}</td>
                        <td class="tw-px-4 tw-py-2">${estado}</td>
                        <td class="tw-px-4 tw-py-2">${mun}</td>
                        <td class="tw-px-4 tw-py-2">
                            <span class="tw-px-2 tw-py-0.5 tw-rounded-full tw-text-[10px] tw-font-bold ${ambito === 'Urbana' ? 'tw-bg-purple-100 tw-text-purple-700' : 'tw-bg-green-100 tw-text-green-700'}">
                                ${ambito}
                            </span>
                        </td>
                        <td class="tw-px-4 tw-py-2 tw-tabular-nums tw-font-bold">${pob.toLocaleString()}</td>
                        <td class="tw-px-4 tw-py-2 tw-tabular-nums tw-text-blue-600">${pobMas.toLocaleString()}</td>
                        <td class="tw-px-4 tw-py-2 tw-tabular-nums tw-text-pink-600">${pobFem.toLocaleString()}</td>
                    </tr>`;
            });

            html += `   </tbody>
                    </table>
                </div>
            </div>`;
        }
    });

    container.innerHTML = html;
}

// --- BUFFER VISUALIZATION & LOGIC ---

window.updateBufferVisualization = function () {
    if (kmlLayers.size === 0) return;

    // 1. Obtener valor del buffer
    let bufferKm = 0;
    const clipSelect = document.getElementById('clipTypeSelect');
    const clipType = clipSelect ? clipSelect.value : 'exact';

    // Mostrar/Ocultar input custom
    const customInput = document.getElementById('customBufferInput');
    if (clipType === 'custom') {
        customInput.classList.remove('tw-hidden');
        bufferKm = parseFloat(customInput.value) || 0;
    } else {
        customInput.classList.add('tw-hidden');
        if (clipType === 'direct') bufferKm = 2;
        else if (clipType === 'indirect') bufferKm = 5;
    }

    console.log(`[Buffer] Actualizando visualización: ${clipType} (${bufferKm} km)`);

    // 2. Actualizar cada capa KML
    const T = window.turf;
    kmlLayers.forEach(d => {
        let clipFeature = d.geojson.features[0];

        // Calcular Buffer
        if (bufferKm > 0) {
            try {
                clipFeature = T.buffer(clipFeature, bufferKm, { units: 'kilometers' });
            } catch (e) { console.error('Buffer val error', e); }
        }

        // Guardar feature con buffer para el análisis posterior
        d.currentBufferFeature = clipFeature;

        // Actualizar Layer Visual (Línea Roja Punteada)
        if (d.bufferLayer) map.removeLayer(d.bufferLayer);
        d.bufferLayer = L.geoJSON(clipFeature, {
            style: { color: '#ef4444', weight: 2, dashArray: '6, 6', fill: false, opacity: 0.8 },
            interactive: false
        }).addTo(map);
    });
};

window.zoomToLocality = function (kmlId, resultIndex) {
    const d = kmlLayers.get(kmlId);
    if (!d || !d.analysis['localidades']) return;

    const feat = d.analysis['localidades'][resultIndex];
    if (!feat) return;

    // 1. Cerrar Modal
    document.getElementById('resultsModal').classList.remove('active');

    // 2. Zoom al feature
    const layer = L.geoJSON(feat);
    const bounds = layer.getBounds();
    map.flyToBounds(bounds, { maxZoom: 14, duration: 1.5 });

    // 3. Highlight temporal
    const highlight = L.geoJSON(feat, {
        style: { color: '#facc15', weight: 5, opacity: 0.8, fillOpacity: 0.2 }
    }).addTo(map);

    setTimeout(() => map.removeLayer(highlight), 3000);
};

window.downloadExcel = function () {
    const wb = XLSX.utils.book_new();

    kmlLayers.forEach(d => {
        const feats = d.analysis['localidades'];
        if (feats && feats.length > 0) {
            // Aplanar propiedades y eliminar geometría
            const rows = feats.map(f => {
                const flat = { ...f.properties };
                // Asegurar que no vaya nada raro
                return flat;
            });

            const ws = XLSX.utils.json_to_sheet(rows);
            // Nombre de hoja seguro (max 31 chars)
            let sheetName = d.name.replace(/[\\/?*\[\]]/g, '').substring(0, 30);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        }
    });

    if (wb.SheetNames.length === 0) {
        alert('No hay datos para exportar');
        return;
    }

    XLSX.writeFile(wb, `Reporte_Localidades_${new Date().getTime()}.xlsx`);
}
// --- INIT WRAPPER ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM Content Loaded - Calling initApp');
        initApp();
    });
} else {
    console.log('Document already loaded - Calling initApp immediately');
    initApp();
}

console.log('test_dynamic.js script execution finished');
