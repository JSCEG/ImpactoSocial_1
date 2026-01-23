/**
 * GEOVISUALIZADOR DE ÁREAS DE INTERÉS - VERSIÓN V3 (MULTI-KML)
 * ========================================================
 * 
 * Versión avanzada con soporte para múltiples archivos KML simultáneos,
 * comparación de resultados y exportación consolidada.
 */

// ============================================================================
// VARIABLES DE ESTADO GLOBAL
// ============================================================================

let map;
let loadedKmls = []; // Array de objetos { id, name, geojson, layer, color }
let baseLayersData = {
    localities: null,
    points: null
};
let analysisResults = []; // Array de resultados por KML
let highlightedLayer = null;

// Configuración de capas disponibles (Misma estructura que V2)
const layerConfig = {
    localities: { url: 'https://cdn.sassoapps.com/Gabvy/localidades_4326.geojson', name: 'Localidades', color: '#800020' },
    points: { url: 'https://cdn.sassoapps.com/Gabvy/localidades_puntos.geojson', name: 'Puntos Loc.', color: '#B38E5D' },
    municipios: { url: 'https://cdn.sassoapps.com/Gabvy/municipios.geojson', name: 'Municipios', color: '#4A5568' },
    atlas: { url: 'https://cdn.sassoapps.com/Gabvy/atlas_pueblos_indigenas.geojson', name: 'Atlas Indígena', color: '#E53E3E' },
    regiones: { url: 'https://cdn.sassoapps.com/Gabvy/regiones_indigenas.geojson', name: 'Regiones Ind.', color: '#DD6B20' },
    lenguas: { url: 'https://cdn.sassoapps.com/Gabvy/lenguas_indigenas.geojson', name: 'Lenguas Ind.', color: '#38A169' },
    loc_ind: { url: 'https://cdn.sassoapps.com/Gabvy/localidades_indigenas.geojson', name: 'Loc. Indígenas', color: '#319795' },
    ruta: { url: 'https://cdn.sassoapps.com/Gabvy/ruta_wixarika.geojson', name: 'Ruta Wixarika', color: '#805AD5' },
    ran: { url: 'https://cdn.sassoapps.com/Gabvy/nucleos_agrarios_ran.geojson', name: 'RAN', color: '#D69E2E' },
    anp_estatal: { url: 'https://cdn.sassoapps.com/Gabvy/anp_estatal.geojson', name: 'ANP Estatal', color: '#38B2AC' },
    ramsar: { url: 'https://cdn.sassoapps.com/Gabvy/sitios_ramsar.geojson', name: 'RAMSAR', color: '#00B5D8' },
    za_publico: { url: 'https://cdn.sassoapps.com/Gabvy/zonas_arqueologicas_publico.geojson', name: 'Zonas Arq.', color: '#D53F8C' },
    z_historicos: { url: 'https://cdn.sassoapps.com/Gabvy/zonas_monumentos_historicos.geojson', name: 'Zonas Hist.', color: '#702459' }
};

// Cache de capas adicionales
let layersCache = {};

// ============================================================================
// UTILIDADES
// ============================================================================

function showAlert(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return alert(message);

    const toast = document.createElement('div');
    const colors = { success: 'tw-bg-green-500', danger: 'tw-bg-red-500', warning: 'tw-bg-yellow-500', info: 'tw-bg-blue-500' };
    
    toast.className = `tw-fixed tw-top-4 tw-right-4 tw-z-[9999] tw-flex tw-items-center tw-w-full tw-max-w-xs tw-p-4 tw-text-white tw-bg-white tw-rounded-xl tw-shadow-2xl tw-transform tw-transition-all tw-duration-300 tw-translate-y-[-100%] tw-opacity-0`;
    toast.innerHTML = `
        <div class="tw-inline-flex tw-items-center tw-justify-center tw-flex-shrink-0 tw-w-8 tw-h-8 ${colors[type] || colors.info} tw-rounded-lg">
            <span class="material-symbols-outlined tw-text-white tw-text-lg">info</span>
        </div>
        <div class="tw-ml-3 tw-text-sm tw-font-medium tw-text-gray-800">${message}</div>
    `;
    
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.remove('tw-translate-y-[-100%]', 'tw-opacity-0'));
    setTimeout(() => {
        toast.classList.add('tw-opacity-0', 'tw-translate-x-full');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function showPreloader() { document.getElementById('preloader').classList.add('active'); }
function hidePreloader() { document.getElementById('preloader').classList.remove('active'); }
function updateProgress(pct) { document.getElementById('preloaderBar').style.width = `${pct}%`; }

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

function initApp() {
    hidePreloader();

    // Configuración del Mapa
    const mapTilerKey = 'jAAFQsMBZ9a6VIm2dCwg'; // Personal key
    const baseMap = L.tileLayer(`https://api.maptiler.com/maps/basic-v2/{z}/{x}/{y}.png?key=${mapTilerKey}`, {
        attribution: '&copy; MapTiler &copy; OpenStreetMap',
        maxZoom: 18
    });

    map = L.map('map', {
        center: [24.1, -102],
        zoom: 5,
        zoomControl: false,
        layers: [baseMap]
    });

    // Elementos DOM
    const kmlInput = document.getElementById('kmlFile');
    const uploadBtn = document.getElementById('uploadKmlBtn');
    const clearBtn = document.getElementById('clearMap');

    // Eventos
    kmlInput.addEventListener('change', handleKmlUpload);
    uploadBtn.addEventListener('click', runMultiAnalysis);
    clearBtn.addEventListener('click', clearAll);

    // Cargar datos base
    loadBaseData();
}

async function loadBaseData() {
    try {
        const [locRes, ptsRes] = await Promise.all([
            fetch(layerConfig.localities.url),
            fetch(layerConfig.points.url)
        ]);
        
        baseLayersData.localities = await locRes.json();
        baseLayersData.points = await ptsRes.json();
        console.log('Datos base cargados V3');
    } catch (e) {
        console.error('Error cargando base:', e);
        showAlert('Error cargando datos base', 'danger');
    }
}

// ============================================================================
// GESTIÓN MULTI-KML
// ============================================================================

function handleKmlUpload(e) {
    const files = Array.from(e.target.files);
    if (loadedKmls.length + files.length > 10) {
        return showAlert('Máximo 10 archivos KML permitidos', 'warning');
    }

    files.forEach(file => {
        if (!file.name.endsWith('.kml') && !file.name.endsWith('.kmz')) return;
        
        const reader = new FileReader();
        reader.onload = (ev) => {
            const kmlText = ev.target.result;
            const dom = new DOMParser().parseFromString(kmlText, 'text/xml');
            const geojson = toGeoJSON.kml(dom);
            
            if (geojson.features.length > 0) {
                addKmlToMap(file.name, geojson);
            }
        };
        reader.readAsText(file);
    });
    
    e.target.value = ''; // Reset input
}

function addKmlToMap(name, geojson) {
    const color = '#' + Math.floor(Math.random()*16777215).toString(16);
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    
    const layer = L.geoJSON(geojson, {
        style: { color: color, weight: 3, fillOpacity: 0.1 }
    }).addTo(map);

    const kmlObj = { id, name, geojson, layer, color };
    loadedKmls.push(kmlObj);
    
    updateKmlList();
    document.getElementById('uploadKmlBtn').disabled = false;
    map.fitBounds(layer.getBounds(), { padding: [50, 50] });
}

function updateKmlList() {
    const container = document.getElementById('kmlListContainer');
    const badge = document.getElementById('kmlCountBadge');
    
    container.innerHTML = '';
    container.classList.remove('tw-hidden');
    badge.textContent = `${loadedKmls.length}/10`;

    loadedKmls.forEach(kml => {
        const div = document.createElement('div');
        div.className = 'tw-flex tw-items-center tw-justify-between tw-bg-white tw-p-2 tw-rounded-lg tw-border tw-border-gray-100 tw-text-xs';
        div.innerHTML = `
            <div class="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
                <span class="tw-w-3 tw-h-3 tw-rounded-full" style="background-color: ${kml.color}"></span>
                <span class="tw-truncate tw-font-bold">${kml.name}</span>
            </div>
            <button class="tw-text-red-400 hover:tw-text-red-600" onclick="removeKml('${kml.id}')">
                <span class="material-symbols-outlined tw-text-base">close</span>
            </button>
        `;
        container.appendChild(div);
    });
}

window.removeKml = function(id) {
    const idx = loadedKmls.findIndex(k => k.id === id);
    if (idx > -1) {
        map.removeLayer(loadedKmls[idx].layer);
        loadedKmls.splice(idx, 1);
        updateKmlList();
        if (loadedKmls.length === 0) document.getElementById('uploadKmlBtn').disabled = true;
    }
};

// ============================================================================
// ANÁLISIS MULTI-KML
// ============================================================================

async function runMultiAnalysis() {
    showPreloader();
    analysisResults = [];
    
    // Limpiar resultados previos del mapa
    map.eachLayer(l => {
        if (l.options && l.options.isResult) map.removeLayer(l);
    });

    const selectedLayers = Array.from(document.querySelectorAll('#layerOptions input:checked')).map(cb => cb.value);
    const clipType = document.getElementById('clipTypeSelect').value;
    const bufferVal = parseFloat(document.getElementById('customBufferInput').value) || 0;

    // Precargar capas seleccionadas
    for (const key of selectedLayers) {
        if (!layersCache[key] && !baseLayersData[key]) {
            if (layerConfig[key]) {
                const res = await fetch(layerConfig[key].url);
                layersCache[key] = await res.json();
            }
        }
    }

    // Ejecutar análisis por cada KML
    for (const kml of loadedKmls) {
        const kmlResults = { kmlId: kml.id, kmlName: kml.name, layers: {} };
        const polygon = kml.geojson.features[0]; // Asumimos primer feature es el polígono principal
        
        // Calcular Buffer
        let clipGeom = polygon;
        let dist = 0;
        if (clipType === 'direct') dist = 2;
        else if (clipType === 'indirect') dist = 5;
        else if (clipType === 'custom') dist = bufferVal;

        if (dist > 0) {
            clipGeom = turf.buffer(polygon, dist, { units: 'kilometers' });
        }

        // Intersección con cada capa
        for (const key of selectedLayers) {
            const sourceData = baseLayersData[key] || layersCache[key] || (key === 'localidades' ? baseLayersData.localities : baseLayersData.points);
            if (!sourceData) continue;

            const features = sourceData.features.filter(f => turf.booleanIntersects(f, clipGeom));
            
            if (features.length > 0) {
                kmlResults.layers[key] = features;
                
                // Visualizar en mapa (coloreado por KML origen)
                L.geoJSON(features, {
                    isResult: true,
                    pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 4, color: kml.color, fillColor: kml.color, fillOpacity: 0.8 }),
                    style: { color: kml.color, weight: 1, fillColor: kml.color, fillOpacity: 0.4 },
                    onEachFeature: (f, l) => l.bindPopup(`<b>${kml.name}</b><br>${key}: ${f.properties.NOM_LOC || f.properties.NOMBRE || 'Elemento'}`)
                }).addTo(map);
            }
        }
        analysisResults.push(kmlResults);
    }

    hidePreloader();
    showResultsUI();
}

// ============================================================================
// RESULTADOS Y REPORTES
// ============================================================================

function showResultsUI() {
    const btn = document.getElementById('floatingResultsBtn');
    const badge = document.getElementById('resultsBadgeCount');
    
    const total = analysisResults.reduce((acc, r) => acc + Object.values(r.layers).reduce((a, l) => a + l.length, 0), 0);
    
    if (total > 0) {
        btn.classList.remove('tw-hidden');
        badge.textContent = total;
        showAlert(`Análisis finalizado. ${total} coincidencias.`, 'success');
        
        // Actualizar selector de KML en modal
        const selector = document.getElementById('kmlResultSelector');
        selector.innerHTML = '<option value="all">Resumen Combinado</option>';
        loadedKmls.forEach(k => {
            selector.innerHTML += `<option value="${k.id}">${k.name}</option>`;
        });
        
        openResultsModal();
    } else {
        showAlert('No se encontraron resultados', 'warning');
    }
}

window.openResultsModal = function() {
    document.getElementById('resultsModal').classList.add('active');
    updateModalContent();
};

window.closeResultsModal = function() {
    document.getElementById('resultsModal').classList.remove('active');
};

document.getElementById('kmlResultSelector').addEventListener('change', updateModalContent);

function updateModalContent() {
    const kmlId = document.getElementById('kmlResultSelector').value;
    const container = document.getElementById('layerFilters');
    container.innerHTML = '';
    
    let displayResults = [];
    if (kmlId === 'all') {
        displayResults = analysisResults;
    } else {
        displayResults = analysisResults.filter(r => r.kmlId === kmlId);
    }

    // Agrupar por capa
    const layerStats = {};
    displayResults.forEach(res => {
        Object.keys(res.layers).forEach(key => {
            if (!layerStats[key]) layerStats[key] = { count: 0, features: [] };
            layerStats[key].count += res.layers[key].length;
            layerStats[key].features.push(...res.layers[key]);
        });
    });

    Object.keys(layerStats).forEach(key => {
        const conf = layerConfig[key] || { name: key, color: '#666' };
        const item = document.createElement('div');
        item.className = 'tw-flex tw-items-center tw-justify-between tw-p-3 tw-rounded-lg tw-cursor-pointer hover:tw-bg-gray-100';
        item.innerHTML = `
            <div class="tw-flex tw-items-center tw-gap-2">
                <span class="tw-w-3 tw-h-3 tw-rounded-full" style="background-color: ${conf.color}"></span>
                <span class="tw-text-xs tw-font-bold">${conf.name}</span>
            </div>
            <span class="tw-bg-gray-200 tw-text-[10px] tw-font-bold tw-px-2 tw-rounded-full">${layerStats[key].count}</span>
        `;
        item.onclick = () => renderTable(key, layerStats[key].features);
        container.appendChild(item);
    });

    // Renderizar primera capa
    const firstKey = Object.keys(layerStats)[0];
    if (firstKey) renderTable(firstKey, layerStats[firstKey].features);
}

function renderTable(key, features) {
    const container = document.getElementById('layerResultsContainer');
    const conf = layerConfig[key] || { name: key, color: '#666' };
    
    let html = `
        <div class="tw-mb-4 tw-flex tw-items-center tw-gap-2">
            <span class="tw-w-4 tw-h-4 tw-rounded-full" style="background-color: ${conf.color}"></span>
            <h3 class="tw-text-lg tw-font-bold">${conf.name} (${features.length})</h3>
        </div>
        <div class="tw-overflow-x-auto">
            <table class="tw-w-full tw-text-left">
                <thead class="tw-bg-gray-50 tw-border-b">
                    <tr>
                        <th class="tw-p-2 tw-text-[10px] tw-uppercase">#</th>
                        <th class="tw-p-2 tw-text-[10px] tw-uppercase">Nombre/ID</th>
                        <th class="tw-p-2 tw-text-[10px] tw-uppercase">Municipio</th>
                        <th class="tw-p-2 tw-text-[10px] tw-uppercase">Estado</th>
                    </tr>
                </thead>
                <tbody class="tw-divide-y">
    `;
    
    features.slice(0, 100).forEach((f, i) => { // Limit 100 for perf
        const p = f.properties;
        html += `
            <tr class="hover:tw-bg-gray-50">
                <td class="tw-p-2 tw-text-xs">${i + 1}</td>
                <td class="tw-p-2 tw-text-xs tw-font-bold">${p.NOM_LOC || p.NOMBRE || p.NOMGEO || '-'}</td>
                <td class="tw-p-2 tw-text-xs">${p.NOM_MUN || '-'}</td>
                <td class="tw-p-2 tw-text-xs">${p.NOM_ENT || '-'}</td>
            </tr>
        `;
    });
    
    html += `</tbody></table></div>`;
    if (features.length > 100) html += `<p class="tw-text-xs tw-text-gray-400 tw-mt-2 tw-text-center">Mostrando primeros 100 registros</p>`;
    
    container.innerHTML = html;
}

function clearAll() {
    loadedKmls.forEach(k => map.removeLayer(k.layer));
    loadedKmls = [];
    updateKmlList();
    
    map.eachLayer(l => {
        if (l.options && l.options.isResult) map.removeLayer(l);
    });
    
    analysisResults = [];
    document.getElementById('floatingResultsBtn').classList.add('tw-hidden');
    document.getElementById('uploadKmlBtn').disabled = true;
}

// ============================================================================
// EXPORTS
// ============================================================================

window.downloadModalExcel = function() {
    const wb = XLSX.utils.book_new();
    
    analysisResults.forEach(res => {
        Object.keys(res.layers).forEach(key => {
            const data = res.layers[key].map(f => ({
                ...f.properties,
                KML_ORIGEN: res.kmlName
            }));
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, `${res.kmlName.substring(0,10)}_${key.substring(0,10)}`);
        });
    });
    
    XLSX.writeFile(wb, 'Reporte_Multicapa_V3.xlsx');
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
