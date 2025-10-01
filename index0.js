/*
 * GEOVISUALIZADOR — VERSIÓN 0 (Capas indígenas, sin buffer, análisis automático)
 * -----------------------------------------------------------------------------
 * - Carga un KML válido y, tras validarlo, ejecuta automáticamente el análisis.
 * - Capas incluidas: Atlas Pueblos Indígenas, Regiones Indígenas, Lenguas, 
 *   Loc Indígenas Datos, Ruta Wixarika. Sin buffer, área exacta.
 * - Exporta Excel con Resumen y "Lenguas (conteo)" (únicas por idioma).
 */

let map;
let kmlLayer = null;
let kmlGeoJson = null;
let lastAreaBounds = null;

// Datos de capas (solo indígenas)
let atlasData = null;           // Atlas de Pueblos Indígenas (puntos/polígonos)
let regionesData = null;        // Regiones indígenas (polígonos)
let lenguasData = null;         // Lenguas (puntos)
let locIndigenasData = null;    // Localidades indígenas datos (puntos)
let rutaWixarikaData = null;    // Multipolígonos ruta Wixarika

// Localidades (V1 logic)
let localitiesData = null;      // Localidades (polígonos)
let localitiesPointsData = null;// Localidades puntos (coordenadas)

// Capas recortadas
let clippedAtlasLayer = null;
let clippedRegionesLayer = null;
let clippedLenguasLayer = null;
let clippedLocIndigenasLayer = null;
let clippedRutaWixarikaLayer = null;
let clippedLocalitiesLayer = null; // Polígonos
let clippedPointsLayer = null;     // Puntos
let labelLayer = null;             // Etiquetas CVEGEO
let featureLayersById = new Map(); // CVEGEO -> { layer, bounds|latlng }
let localidadesLayerGroup = null;  // Grupo combinado de localidades (polígonos+puntos+etiquetas)

// Referencias de features por capa para navegación desde el listado
const featureRefsAtlas = new Map();           // key: CVEGEO
const featureRefsRegiones = new Map();        // key: Name/NOMBRE
const featureRefsLenguas = new Map();         // key: LENGUA (UPPER) -> Array<ref>
const featureRefsLocInd = new Map();          // key: LOCALIDAD
const featureRefsWixa = new Map();            // key: Name/NOMBRE

let layersControl = null;
let totalElements = 0;
let layersData = {};

// Utils UI
function showAlert(message, type = 'info', timeoutMs = 4000) {
    const container = document.getElementById('alertContainer');
    if (!container) { try { alert(message); } catch (_) { } return; }
    const wrap = document.createElement('div');
    wrap.className = `alert alert-${type} alert-dismissible fade show shadow`;
    wrap.setAttribute('role', 'alert');
    wrap.innerHTML = `<div>${message}</div><button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>`;
    container.appendChild(wrap);
    if (timeoutMs > 0) setTimeout(() => { wrap.classList.remove('show'); wrap.addEventListener('transitionend', () => wrap.remove()); }, timeoutMs);
}

function showPreloader() {
    const pre = document.getElementById('preloader');
    if (!pre) return;
    pre.classList.remove('preloader-hide');
    pre.removeAttribute('hidden');
    pre.style.display = 'flex';
}
function hidePreloader() {
    const pre = document.getElementById('preloader');
    if (!pre) return;
    pre.setAttribute('hidden', '');
    pre.style.display = 'none';
    setTimeout(() => map && map.invalidateSize(), 100);
}
function updateProgress(percent, message) {
    const bar = document.getElementById('preProgressBar');
    const msg = document.getElementById('preloaderMessage');
    if (bar) { const p = Math.max(0, Math.min(100, percent)); bar.style.width = p + '%'; bar.setAttribute('aria-valuenow', String(Math.round(p))); }
    if (msg && typeof message === 'string') msg.textContent = message;
}

function initMap() {
    // Guard: wait until the map container exists
    const mapEl = document.getElementById('map');
    if (!mapEl) {
        // Retry shortly; DOM might not be fully parsed yet
        setTimeout(initMap, 50);
        return;
    }
    // If a map instance already exists on this container, remove it to avoid Leaflet error
    if (map) {
        try { map.remove(); } catch (_) { }
        map = null;
    }
    const mexicoBounds = L.latLngBounds([[14.0, -118.0], [33.5, -86.0]]);

    // Basemaps (alineado con otras versiones)
    const mapTilerKeys = { personal: 'jAAFQsMBZ9a6VIm2dCwg', amigo: 'xRR3xCujdkUjxkDqlNTG' };
    const checkSDK = () => (typeof L.maptiler !== 'undefined' && L.maptiler.maptilerLayer);
    function createMapTilerLayer(styleId, apiKeyType, fallbackUrl, attribution) {
        const apiKey = mapTilerKeys[apiKeyType];
        if (checkSDK()) {
            try {
                const layer = L.maptiler.maptilerLayer({ apiKey, style: styleId, maxZoom: 18 });
                if (!layer.options) layer.options = {}; if (!layer.options.maxZoom) layer.options.maxZoom = 18;
                return layer;
            } catch (_) { /* fallback below */ }
        }
        return L.tileLayer(fallbackUrl, { attribution, maxZoom: 18 });
    }
    const baseMaps = {
        'SENER Azul': createMapTilerLayer('0198a42c-5e08-77a1-9773-763ee4e12b32', 'personal', 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', '&copy; MapTiler &copy; OpenStreetMap'),
        'SENER Light': createMapTilerLayer('0198a9af-dc7c-79d3-8316-a80767ad1d0f', 'amigo', 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', '&copy; MapTiler &copy; OpenStreetMap'),
        'SENER Oscuro': createMapTilerLayer('0198a9f0-f135-7991-aaec-bea71681556e', 'amigo', 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', '&copy; MapTiler &copy; OpenStreetMap'),
        'Google Satellite': L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { attribution: '&copy; Google', maxZoom: 20 })
    };

    const defaultBase = baseMaps['SENER Oscuro'] || Object.values(baseMaps)[0];
    map = L.map('map', { center: [24.1, -102], zoom: 5, minZoom: 4, maxZoom: 18, maxBounds: mexicoBounds, maxBoundsViscosity: 0.9, layers: [defaultBase] });
    map.on('zoomend', () => { if (map.getZoom() < 4) map.setZoom(4); });
    map.fitBounds(mexicoBounds.pad(-0.15));
    layersControl = L.control.layers(baseMaps, {}, { collapsed: false }).addTo(map);
    setTimeout(() => map.invalidateSize(), 100);
}

async function loadSingleLayer(url, name) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const r = await fetch(url, { signal: controller.signal, mode: 'cors', headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' } });
        clearTimeout(timeoutId);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.json();
    } catch (e) {
        // proxy fallback
        try {
            const proxy = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(url));
            const pjson = await proxy.json();
            return JSON.parse(pjson.contents);
        } catch (e2) {
            console.warn('Capa falló:', name, e2);
            return { type: 'FeatureCollection', features: [] };
        }
    }
}

async function loadIndigenousLayers() {
    showPreloader();
    updateProgress(5, 'Cargando capas indígenas…');
    const urls = {
        atlas: 'https://cdn.sassoapps.com/Gabvy/atlaspueblosindigenas.geojson',
        regiones: 'https://cdn.sassoapps.com/Gabvy/regionesindigenas.geojson',
        lenguas: 'https://cdn.sassoapps.com/Gabvy/lenguasindigenas.geojson',
        loc_indigenas_datos: 'https://cdn.sassoapps.com/Gabvy/loc_indigenas_datos.geojson',
        rutaWixarika: 'https://cdn.sassoapps.com/Gabvy/rutaWixarika.geojson'
    };
    atlasData = await loadSingleLayer(urls.atlas, 'Atlas Pueblos Indígenas'); updateProgress(25, 'Atlas cargado');
    regionesData = await loadSingleLayer(urls.regiones, 'Regiones Indígenas'); updateProgress(45, 'Regiones cargadas');
    lenguasData = await loadSingleLayer(urls.lenguas, 'Lenguas Indígenas'); updateProgress(65, 'Lenguas cargadas');
    locIndigenasData = await loadSingleLayer(urls.loc_indigenas_datos, 'Loc Indígenas Datos'); updateProgress(85, 'Loc. indígenas cargadas');
    rutaWixarikaData = await loadSingleLayer(urls.rutaWixarika, 'Ruta Wixarika'); updateProgress(92, 'Ruta Wixarika cargada');

    // Cargar Localidades (polígonos y puntos)
    try {
        const locPolysUrl = 'https://cdn.sassoapps.com/Gabvy/localidades_4326.geojson';
        const locPointsUrl = 'https://cdn.sassoapps.com/Gabvy/localidades_puntos.geojson';
        localitiesData = await loadSingleLayer(locPolysUrl, 'Localidades (polígonos)');
        updateProgress(96, 'Localidades (polígonos) cargadas');
        localitiesPointsData = await loadSingleLayer(locPointsUrl, 'Localidades (puntos)');
        updateProgress(98, 'Localidades (puntos) cargadas');
    } catch (e) {
        console.warn('Fallo al cargar localidades', e);
    }
    hidePreloader();
}

function validateKmlFile(file) {
    const name = (file?.name || '').toLowerCase();
    if (!name.endsWith('.kml') && !name.endsWith('.kmz')) { showAlert('Selecciona un archivo .kml o .kmz', 'warning'); return false; }
    if (file.size > 10 * 1024 * 1024) { showAlert('El archivo excede 10MB', 'warning'); return false; }
    return true;
}

function processKmlFile(file) {
    if (!validateKmlFile(file)) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const kmlText = e.target.result;
            updateProgress(15, 'Validando KML…');
            const kmlDom = new DOMParser().parseFromString(kmlText, 'text/xml');
            const parseError = kmlDom.querySelector('parsererror');
            if (parseError) { showAlert('KML inválido (XML)', 'danger', 6000); return; }
            const gj = toGeoJSON.kml(kmlDom);
            const polys = (gj.features || []).filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));
            if (polys.length === 0) { showAlert('El KML no contiene polígonos', 'warning'); return; }

            let kmlPolygon;
            if (polys.length === 1) {
                kmlPolygon = polys[0];
            } else {
                const parts = [];
                polys.forEach(p => { if (p.geometry.type === 'Polygon') parts.push(p.geometry.coordinates); else if (p.geometry.type === 'MultiPolygon') parts.push(...p.geometry.coordinates); });
                kmlPolygon = { type: 'Feature', properties: polys[0].properties || {}, geometry: { type: 'MultiPolygon', coordinates: parts } };
            }
            kmlGeoJson = { type: 'FeatureCollection', features: [kmlPolygon] };

            if (kmlLayer) map.removeLayer(kmlLayer);
            kmlLayer = L.geoJSON(kmlPolygon, { style: { color: '#ff7800', weight: 3, fillColor: '#ffa500', fillOpacity: 0.2 } }).addTo(map);
            const b = kmlLayer.getBounds();
            if (b && b.isValid()) { map.fitBounds(b, { padding: [24, 24], maxZoom: 15, animate: true, duration: 0.4 }); lastAreaBounds = b; }

            showAlert('KML validado. Ejecutando análisis automático…', 'success');
            updateProgress(20, 'Preparando análisis…');
            // Auto-run analysis (exact area, no buffer)
            setTimeout(performClipping, 200);

            const centerKmlBtn = document.getElementById('centerKmlBtn');
            if (centerKmlBtn) centerKmlBtn.disabled = false;
        } catch (err) {
            console.error('KML error', err);
            showAlert('No se pudo procesar el KML', 'danger', 6000);
            hidePreloader();
        }
    };
    reader.onerror = function () { showAlert('Error leyendo el archivo', 'danger'); hidePreloader(); };
    reader.readAsText(file);
}

function clipLayer(data, styleOptions, popupFormatter, clipArea) {
    const T = window.turf;
    const clipGeom = clipArea || (kmlGeoJson?.features?.find(f => f.geometry.type.includes('Polygon')));
    if (!clipGeom) return { clipped: [], layer: L.layerGroup() };
    const clipped = (data.features || []).filter(f => { try { return T.booleanIntersects(f.geometry, clipGeom.geometry); } catch (_) { return false; } });
    const layer = L.geoJSON(T.featureCollection(clipped), styleOptions);
    if (popupFormatter) {
        layer.eachLayer(l => { const p = l.feature?.properties || {}; l.bindPopup(popupFormatter(p)); });
    }
    return { clipped, layer };
}

function updateLayersDisplay(layersDataParam) {
    const layersContainer = document.getElementById('layersContainer');
    const totalFoundEl = document.getElementById('totalFound');
    const downloadBtn = document.getElementById('downloadReportBtn');
    const chartsContainer = document.getElementById('chartsContainer');
    layersContainer.innerHTML = '';
    layersData = layersDataParam; totalElements = 0;

    const titles = {
        atlas: 'Atlas Pueblos Indígenas',
        regiones: 'Regiones Indígenas',
        lenguas: 'Lenguas Indígenas',
        loc_indigenas_datos: 'Loc Indígenas Datos',
        rutaWixarika: 'Ruta Wixarika',
        localidades: 'Localidades'
    };
    const propertyMap = {
        atlas: 'CVEGEO',
        regiones: 'Name',
        lenguas: 'Lengua',
        loc_indigenas_datos: 'LOCALIDAD',
        rutaWixarika: 'Name',
        localidades: 'CVEGEO'
    };
    const colors = { atlas: '#ff00ff', regiones: '#ffa500', lenguas: '#00ffff', loc_indigenas_datos: '#8000ff', rutaWixarika: '#ff8000', localidades: '#118833' };

    Object.entries(layersData).forEach(([name, data]) => {
        if (!data.features) return;
        const section = document.createElement('div'); section.className = 'layer-section';
        const header = document.createElement('h6'); const content = document.createElement('div'); content.className = 'layer-content';
        if (name === 'lenguas') {
            const counts = new Map();
            data.features.forEach(f => { const p = f.properties || {}; const lengua = p.Lengua || p.LENGUA || 'Sin dato'; counts.set(lengua, (counts.get(lengua) || 0) + 1); });
            const arr = Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
            header.innerHTML = `${titles[name]} <span class="badge bg-secondary">${arr.length} únicas</span>`;
            const ul = document.createElement('ul');
            arr.forEach(([lengua, count]) => { const li = document.createElement('li'); li.innerHTML = `<span class="color-dot" style="background:${colors[name]}"></span>${lengua} <span class="badge bg-light text-dark ms-1">${count}</span>`; li.dataset.layer = 'lenguas'; li.dataset.key = String(lengua).toUpperCase(); li.tabIndex = 0; ul.appendChild(li); });
            content.appendChild(ul); totalElements += arr.length;

            // Interacción para lenguas: enciende la capa si está apagada, centra bounds de todas y resalta una
            ul.querySelectorAll('li[data-layer="lenguas"]').forEach(li => {
                li.addEventListener('click', () => {
                    if (clippedLenguasLayer && !map.hasLayer(clippedLenguasLayer)) clippedLenguasLayer.addTo(map);
                    const key = li.dataset.key; const refs = featureRefsLenguas.get(key) || [];
                    if (refs.length === 0) return;
                    let bounds = null;
                    refs.forEach(ref => {
                        if (ref.latlng) { const b = L.latLngBounds(ref.latlng, ref.latlng); bounds = bounds ? bounds.extend(b) : b; }
                        else if (ref.bounds?.isValid && ref.bounds.isValid()) { bounds = bounds ? bounds.extend(ref.bounds) : ref.bounds; }
                    });
                    if (bounds && bounds.isValid()) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
                    setActiveListItemInUL(ul, li);
                    highlightAndGo(refs[0]);
                });
                li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); } });
            });
        } else {
            header.innerHTML = `${titles[name]} <span class="badge bg-secondary">${data.features.length}</span>`;
            // Caso especial: Localidades → separar por origen (Polígono / Coordenadas)
            if (name === 'localidades') {
                const polyFeatures = data.features.filter(f => (f.properties?.origen || '').toLowerCase().includes('poligon'));
                const pointFeatures = data.features.filter(f => (f.properties?.origen || '').toLowerCase().includes('coorden'));

                const makeSubsection = (title, features) => {
                    if (!features.length) return null;
                    const sub = document.createElement('div');
                    const sh = document.createElement('div');
                    sh.className = 'd-flex align-items-center justify-content-between mt-1 mb-1';
                    sh.innerHTML = `<span class="text-secondary">${title}</span><span class="badge bg-light text-dark">${features.length}</span>`;
                    const ul = document.createElement('ul');
                    features.forEach(f => {
                        const p = f.properties || {}; const key = p.CVEGEO; const nm = p.NOM_LOC || p.NOMGEO || 'Sin nombre';
                        const li = document.createElement('li');
                        li.innerHTML = `<span class="color-dot" style="background:${colors[name]}"></span>${nm} (${p.CVEGEO || '-'})`;
                        if (key) { li.dataset.layer = name; li.dataset.key = String(key); li.tabIndex = 0; }
                        ul.appendChild(li);
                    });
                    sub.appendChild(sh); sub.appendChild(ul);
                    // Listeners
                    ul.querySelectorAll('li[data-layer]')?.forEach(li => {
                        li.addEventListener('click', () => {
                            const layerName = li.dataset.layer; const key = li.dataset.key;
                            if (layerName === 'localidades' && localidadesLayerGroup && !map.hasLayer(localidadesLayerGroup)) localidadesLayerGroup.addTo(map);
                            let ref = featureLayersById.get(key);
                            if (ref) { setActiveListItemInUL(ul, li); highlightAndGo(ref); }
                        });
                        li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); } });
                    });
                    return sub;
                };

                const s1 = makeSubsection('Polígono', polyFeatures);
                const s2 = makeSubsection('Coordenadas', pointFeatures);
                if (s1) content.appendChild(s1);
                if (s2) content.appendChild(s2);
                totalElements += data.features.length;
            } else {
                // Resto de capas (genérico)
                const ul = document.createElement('ul');
                data.features.forEach(f => {
                    const p = f.properties || {}; const key = p[propertyMap[name]]; let label = key; if (name === 'atlas') { const nm = p.Localidad || p.NOM_LOC || 'Sin localidad'; label = `${nm} (${p.CVEGEO || '-'})`; } if (name === 'loc_indigenas_datos') { label = p.LOCALIDAD || 'Sin localidad'; }
                    const li = document.createElement('li');
                    li.innerHTML = `<span class="color-dot" style="background:${colors[name]}"></span>${label}`;
                    if (key) { li.dataset.layer = name; li.dataset.key = String(key); li.tabIndex = 0; }
                    ul.appendChild(li);
                });
                content.appendChild(ul); totalElements += data.features.length;
                ul.querySelectorAll('li[data-layer]')?.forEach(li => {
                    li.addEventListener('click', () => {
                        const layerName = li.dataset.layer; const key = li.dataset.key;
                        if (layerName === 'atlas' && clippedAtlasLayer && !map.hasLayer(clippedAtlasLayer)) clippedAtlasLayer.addTo(map);
                        if (layerName === 'regiones' && clippedRegionesLayer && !map.hasLayer(clippedRegionesLayer)) clippedRegionesLayer.addTo(map);
                        if (layerName === 'loc_indigenas_datos' && clippedLocIndigenasLayer && !map.hasLayer(clippedLocIndigenasLayer)) clippedLocIndigenasLayer.addTo(map);
                        if (layerName === 'rutaWixarika' && clippedRutaWixarikaLayer && !map.hasLayer(clippedRutaWixarikaLayer)) clippedRutaWixarikaLayer.addTo(map);
                        let ref = null;
                        switch (layerName) {
                            case 'atlas': ref = featureRefsAtlas.get(key); break;
                            case 'regiones': ref = featureRefsRegiones.get(key); break;
                            case 'loc_indigenas_datos': ref = featureRefsLocInd.get(key); break;
                            case 'rutaWixarika': ref = featureRefsWixa.get(key); break;
                            case 'localidades': ref = featureLayersById.get(key); break;
                            case 'lenguas': {
                                const arr = featureRefsLenguas.get(String(key).toUpperCase()) || [];
                                if (arr.length) ref = arr[0];
                                break;
                            }
                        }
                        if (ref) { setActiveListItemInUL(ul, li); highlightAndGo(ref); }
                    });
                    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); } });
                });
            }
        }
        section.appendChild(header); section.appendChild(content); layersContainer.appendChild(section);
    });

    if (totalFoundEl) totalFoundEl.textContent = (totalElements || 0).toLocaleString('es-MX');
    if (downloadBtn) downloadBtn.disabled = totalElements === 0;

    if (chartsContainer) {
        if (totalElements > 0) { chartsContainer.style.display = 'block'; generateLayerChart(layersData); }
        else { chartsContainer.style.display = 'none'; }
    }
}

function generateLayerChart(ld) {
    if (!window.Highcharts) return;
    const colors = { atlas: '#ff00ff', regiones: '#ffa500', lenguas: '#00ffff', loc_indigenas_datos: '#8000ff', rutaWixarika: '#ff8000', localidades: '#118833' };
    const names = { atlas: 'Atlas', regiones: 'Regiones', lenguas: 'Lenguas (únicas)', loc_indigenas_datos: 'Loc Indígenas', rutaWixarika: 'Ruta Wixarika', localidades: 'Localidades' };
    const data = [];
    Object.entries(ld).forEach(([k, v]) => {
        if (!v.features || v.features.length === 0) return;
        const y = k === 'lenguas' ? new Set(v.features.map(f => f.properties?.Lengua || f.properties?.LENGUA)).size : v.features.length;
        data.push({ name: names[k] || k, y, color: colors[k] || '#666' });
    });
    Highcharts.chart('layerChart', {
        chart: { type: 'bar', backgroundColor: 'transparent' },
        accessibility: { enabled: false },
        title: { text: null },
        xAxis: { categories: data.map(d => d.name) },
        yAxis: { title: { text: 'Elementos' } },
        legend: { enabled: false },
        series: [{ name: 'Elementos', data, colorByPoint: true }],
        credits: { enabled: false }
    });
}

// Highlight utilities for list selection → map
let highlightedLayer = null;
function setActiveListItemInUL(ul, li) {
    try { ul.querySelectorAll('li').forEach(n => n.classList.remove('active')); } catch (_) { }
    li.classList.add('active');
}
function clearHighlight() {
    if (!highlightedLayer) return;
    try {
        if (typeof highlightedLayer.setStyle === 'function' && highlightedLayer.options?.originalStyle) {
            highlightedLayer.setStyle(highlightedLayer.options.originalStyle);
        } else if (highlightedLayer.setRadius && highlightedLayer.options?.originalStyle) {
            const s = highlightedLayer.options.originalStyle;
            highlightedLayer.setStyle?.(s);
            highlightedLayer.setRadius(s.radius || 5);
        }
    } catch (_) { }
    highlightedLayer = null;
}
function highlightAndGo(ref) {
    clearHighlight();
    const layer = ref.layer; if (!layer) return;
    if (!layer.options) layer.options = {};
    if (!layer.options.originalStyle) {
        if (layer.options.radius != null) {
            layer.options.originalStyle = { radius: layer.options.radius, color: layer.options.color, weight: layer.options.weight, opacity: layer.options.opacity, fillColor: layer.options.fillColor, fillOpacity: layer.options.fillOpacity };
        } else {
            layer.options.originalStyle = { color: layer.options.color, weight: layer.options.weight, opacity: layer.options.opacity, fillColor: layer.options.fillColor, fillOpacity: layer.options.fillOpacity };
        }
    }
    try {
        if (typeof layer.setStyle === 'function') {
            layer.setStyle({ color: '#FFFF00', weight: 5, opacity: 1, fillColor: '#FFFF00', fillOpacity: 0.6 });
        } else if (layer.setRadius) {
            layer.setStyle?.({ color: '#222', weight: 1, fillColor: '#FFFF00', fillOpacity: 0.9 });
            layer.setRadius((layer.options.originalStyle.radius || 5) + 3);
        }
        layer.bringToFront?.();
    } catch (_) { }
    highlightedLayer = layer;
    if (ref.bounds && ref.bounds.isValid && ref.bounds.isValid()) {
        map.fitBounds(ref.bounds, { padding: [36, 36], maxZoom: 16 });
    } else if (ref.latlng) {
        map.setView(ref.latlng, Math.max(map.getZoom(), 14), { animate: true });
    }
    layer.openPopup?.();
}

async function performClipping() {
    try {
        if (!kmlGeoJson) { showAlert('Carga un KML válido', 'warning'); return; }
        showPreloader(); updateProgress(10, 'Analizando intersecciones…');
        const clipArea = kmlGeoJson.features.find(f => f.geometry.type.includes('Polygon'));

        // Limpiar previas
        [clippedAtlasLayer, clippedRegionesLayer, clippedLenguasLayer, clippedLocIndigenasLayer, clippedRutaWixarikaLayer, clippedLocalitiesLayer, clippedPointsLayer, labelLayer, localidadesLayerGroup].forEach(l => { if (l) map.removeLayer(l); });
        if (layersControl) { map.removeControl(layersControl); }
        // Re-crear control de capas incluyendo basemaps actuales del mapa
        let currentBases = {};
        try {
            // Recuperar las capas base desde el propio mapa (las primeras tile layers activas)
            // Si no es posible, dejar vacío y Leaflet mostrará solo overlays.
            currentBases = layersControl && layersControl._layers ? layersControl._layers : {};
        } catch (_) { }
        layersControl = L.control.layers(null, null, { collapsed: false }).addTo(map);

        const stylePoly = (color) => ({ style: { color, weight: 2, fillOpacity: 0.1 } });
        const stylePoint = (color) => ({ pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 5, fillColor: color, color: '#000', weight: 1, opacity: 1, fillOpacity: 0.85 }) });

        const atlasRes = clipLayer(atlasData || { features: [] }, stylePoint('#ff00ff'), (p) => `<strong>Atlas</strong><br>CVEGEO: ${p.CVEGEO || ''}<br>Localidad: ${p.Localidad || p.NOM_LOC || ''}`, clipArea);
        clippedAtlasLayer = atlasRes.layer.addTo(map); layersControl.addOverlay(clippedAtlasLayer, 'Atlas Pueblos Indígenas');
        featureRefsAtlas.clear();
        clippedAtlasLayer.eachLayer(l => { const props = l.feature?.properties || {}; const key = props.CVEGEO; if (!key) return; const ref = { layer: l }; if (l.getLatLng) ref.latlng = l.getLatLng(); featureRefsAtlas.set(String(key), ref); });
        // Guardar estilo original en puntos
        clippedAtlasLayer.eachLayer(l => {
            if (!l.options) l.options = {};
            if (!l.options.originalStyle) l.options.originalStyle = { radius: l.options.radius, color: l.options.color, weight: l.options.weight, opacity: l.options.opacity, fillColor: l.options.fillColor, fillOpacity: l.options.fillOpacity };
        });

        const regRes = clipLayer(regionesData || { features: [] }, stylePoly('#ffa500'), (p) => `<strong>Región</strong><br>Nombre: ${p.Name || p.NOMBRE || ''}`, clipArea);
        clippedRegionesLayer = regRes.layer.addTo(map); layersControl.addOverlay(clippedRegionesLayer, 'Regiones Indígenas');
        featureRefsRegiones.clear();
        clippedRegionesLayer.eachLayer(l => { const props = l.feature?.properties || {}; const key = props.Name || props.NOMBRE; if (!key) return; const ref = { layer: l }; if (l.getBounds) ref.bounds = l.getBounds(); featureRefsRegiones.set(String(key), ref); });
        clippedRegionesLayer.eachLayer(l => {
            if (!l.options) l.options = {};
            if (!l.options.originalStyle) l.options.originalStyle = { color: l.options.color, weight: l.options.weight, opacity: l.options.opacity, fillColor: l.options.fillColor, fillOpacity: l.options.fillOpacity };
        });

        const lenRes = clipLayer(lenguasData || { features: [] }, stylePoint('#00ffff'), (p) => `<strong>Lengua</strong><br>${p.Lengua || p.LENGUA || 'Sin especificar'}`, clipArea);
        clippedLenguasLayer = lenRes.layer.addTo(map); layersControl.addOverlay(clippedLenguasLayer, 'Lenguas Indígenas');
        featureRefsLenguas.clear();
        clippedLenguasLayer.eachLayer(l => { const props = l.feature?.properties || {}; const key = (props.Lengua || props.LENGUA || 'Sin dato').toString().toUpperCase(); const ref = { layer: l }; if (l.getLatLng) ref.latlng = l.getLatLng(); if (!featureRefsLenguas.has(key)) featureRefsLenguas.set(key, []); featureRefsLenguas.get(key).push(ref); });
        clippedLenguasLayer.eachLayer(l => {
            if (!l.options) l.options = {};
            if (!l.options.originalStyle) l.options.originalStyle = { radius: l.options.radius, color: l.options.color, weight: l.options.weight, opacity: l.options.opacity, fillColor: l.options.fillColor, fillOpacity: l.options.fillOpacity };
        });

        const locRes = clipLayer(locIndigenasData || { features: [] }, stylePoint('#8000ff'), (p) => `<strong>Localidad Indígena</strong><br>${p.LOCALIDAD || ''}`, clipArea);
        clippedLocIndigenasLayer = locRes.layer.addTo(map); layersControl.addOverlay(clippedLocIndigenasLayer, 'Loc Indígenas Datos');
        featureRefsLocInd.clear();
        clippedLocIndigenasLayer.eachLayer(l => { const props = l.feature?.properties || {}; const key = props.LOCALIDAD; if (!key) return; const ref = { layer: l }; if (l.getLatLng) ref.latlng = l.getLatLng(); featureRefsLocInd.set(String(key), ref); });
        clippedLocIndigenasLayer.eachLayer(l => {
            if (!l.options) l.options = {};
            if (!l.options.originalStyle) l.options.originalStyle = { radius: l.options.radius, color: l.options.color, weight: l.options.weight, opacity: l.options.opacity, fillColor: l.options.fillColor, fillOpacity: l.options.fillOpacity };
        });

        const wixRes = clipLayer(rutaWixarikaData || { features: [] }, stylePoly('#ff8000'), (p) => `<strong>Ruta Wixarika</strong>`, clipArea);
        clippedRutaWixarikaLayer = wixRes.layer.addTo(map); layersControl.addOverlay(clippedRutaWixarikaLayer, 'Ruta Wixarika');
        featureRefsWixa.clear();
        clippedRutaWixarikaLayer.eachLayer(l => { const props = l.feature?.properties || {}; const key = props.Name || props.NOMBRE; if (!key) return; const ref = { layer: l }; if (l.getBounds) ref.bounds = l.getBounds(); featureRefsWixa.set(String(key), ref); });
        clippedRutaWixarikaLayer.eachLayer(l => {
            if (!l.options) l.options = {};
            if (!l.options.originalStyle) l.options.originalStyle = { color: l.options.color, weight: l.options.weight, opacity: l.options.opacity, fillColor: l.options.fillColor, fillOpacity: l.options.fillOpacity };
        });

        // Localidades (V1 logic): intersectar polígonos y puntos, dedupe por CVEGEO
        const T = window.turf;
        const clippedLocalities = [];
        const clippedPoints = [];
        try {
            const locFeatures = Array.isArray(localitiesData?.features) ? localitiesData.features : [];
            const total = locFeatures.length;
            const step = Math.max(1, Math.floor(total / 5));
            locFeatures.forEach((loc, idx) => {
                try { if (T && clipArea && T.booleanIntersects(loc.geometry, clipArea.geometry)) { loc.properties = loc.properties || {}; loc.properties.origen = 'Capa de Poligonos'; clippedLocalities.push(loc); } } catch (_) { }
                if (idx % step === 0) updateProgress(20 + Math.min(60, Math.round((idx / Math.max(1, total)) * 60)), 'Procesando localidades…');
            });
            const existing = new Set(clippedLocalities.map(f => f.properties?.CVEGEO).filter(Boolean));
            const pointFeatures = Array.isArray(localitiesPointsData?.features) ? localitiesPointsData.features : [];
            pointFeatures.forEach(pt => {
                try {
                    const id = pt.properties?.CVEGEO;
                    if (id && !existing.has(id) && T && clipArea && T.booleanIntersects(pt.geometry, clipArea.geometry)) {
                        pt.properties = pt.properties || {}; pt.properties.origen = 'Capa de Coordenadas'; clippedPoints.push(pt);
                    }
                } catch (_) { }
            });
        } catch (e) { console.warn('Localidades clipping error', e); }

        const colorsById = new Map();
        const palette = ['#d11149', '#1a8fe3', '#119822', '#ff7f0e', '#9467bd', '#e377c2', '#17becf', '#bcbd22', '#8c564b', '#2ca02c', '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf', '#999999', '#66c2a5', '#fc8d62'];
        let colorIndex = 0;
        const allLocFeatures = [...clippedLocalities, ...clippedPoints];
        allLocFeatures.forEach(f => { const id = f.properties?.CVEGEO || String(colorIndex); if (!colorsById.has(id)) { colorsById.set(id, palette[colorIndex % palette.length]); colorIndex++; } });

        if (clippedLocalities.length > 0) {
            clippedLocalitiesLayer = L.geoJSON(T.featureCollection(clippedLocalities), {
                style: (feature) => { const id = feature.properties?.CVEGEO; const color = colorsById.get(id) || '#118833'; return { color, weight: 2, opacity: 0.9, fillColor: color, fillOpacity: 0.25 }; },
                onEachFeature: (feature, layer) => {
                    const props = feature.properties || {}; const nombre = props.NOM_LOC || props.NOMGEO || '—';
                    layer.bindPopup(`<strong>Localidad (Polígono)</strong><br><strong>Nombre:</strong> ${nombre}<br><strong>CVEGEO:</strong> ${props.CVEGEO || '—'}`);
                    const id = props.CVEGEO; const ref = { layer }; if (layer.getBounds) ref.bounds = layer.getBounds(); if (id) featureLayersById.set(id, ref);
                    layer.on('click', () => { if (layer.openPopup) layer.openPopup(); });
                }
            });
        }

        if (clippedPoints.length > 0) {
            clippedPointsLayer = L.geoJSON(T.featureCollection(clippedPoints), {
                pointToLayer: (feature, latlng) => { const id = feature.properties?.CVEGEO; const color = colorsById.get(id) || '#118833'; return L.circleMarker(latlng, { radius: 7, fillColor: color, color: '#222', weight: 1, opacity: 1, fillOpacity: 0.85 }); },
                onEachFeature: (feature, layer) => {
                    const props = feature.properties || {}; const nombre = props.NOM_LOC || props.NOMGEO || '—';
                    layer.bindPopup(`<strong>Localidad (Coordenadas)</strong><br><strong>Nombre:</strong> ${nombre}<br><strong>CVEGEO:</strong> ${props.CVEGEO || '—'}<br><small><em>Identificada por coordenadas.</em></small>`);
                    const id = props.CVEGEO; const ref = { layer, latlng: layer.getLatLng() }; if (id) featureLayersById.set(id, ref);
                    layer.on('click', () => { if (layer.openPopup) layer.openPopup(); });
                }
            });
        }

        // Etiquetas CVEGEO
        if (allLocFeatures.length > 0) {
            const labels = [];
            allLocFeatures.forEach(f => {
                const id = f.properties?.CVEGEO; const color = colorsById.get(id) || '#118833';
                let position = null;
                if (f.geometry.type === 'Point') { const [lng, lat] = f.geometry.coordinates; position = [lat, lng]; }
                else if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
                    try { const c = T.centroid(f); const [lng, lat] = c.geometry.coordinates; position = [lat, lng]; } catch (_) { }
                }
                if (position) { const icon = L.divIcon({ className: 'cvegeo-label', html: `<span style="background:${color};color:#fff;padding:2px 4px;border-radius:3px;font-size:11px;">${id || ''}</span>` }); labels.push(L.marker(position, { icon })); }
            });
            if (labels.length) { labelLayer = L.layerGroup(labels); }
        }

        // Combinar Localidades en una sola capa para el mapa (polígonos + puntos + etiquetas)
        if (clippedLocalitiesLayer || clippedPointsLayer || labelLayer) {
            const parts = [];
            if (clippedLocalitiesLayer) parts.push(clippedLocalitiesLayer);
            if (clippedPointsLayer) parts.push(clippedPointsLayer);
            if (labelLayer) parts.push(labelLayer);
            localidadesLayerGroup = L.layerGroup(parts).addTo(map);
            layersControl.addOverlay(localidadesLayerGroup, 'Localidades');
        }

        layersData = {
            atlas: { features: atlasRes.clipped },
            regiones: { features: regRes.clipped },
            lenguas: { features: lenRes.clipped },
            loc_indigenas_datos: { features: locRes.clipped },
            rutaWixarika: { features: wixRes.clipped },
            localidades: { features: allLocFeatures }
        };
        updateLayersDisplay(layersData);

        const bounds = clipArea ? L.geoJSON(clipArea).getBounds() : (kmlLayer && kmlLayer.getBounds());
        if (bounds && bounds.isValid()) { map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 }); lastAreaBounds = bounds; }

        hidePreloader(); showAlert('Análisis completado', 'success');
    } catch (e) {
        console.error('performClipping error', e); hidePreloader(); showAlert('Error durante el análisis', 'danger', 6000);
    }
}

function wireExcelExport() {
    const btn = document.getElementById('downloadReportBtn');
    if (!btn) return;
    const getFeatures = (layer) => { try { const gj = layer?.toGeoJSON?.(); return Array.isArray(gj?.features) ? gj.features : []; } catch (_) { return []; } };
    btn.addEventListener('click', function () {
        try {
            if (!window.XLSX) { alert('No se encontró la librería XLSX'); return; }
            const wb = XLSX.utils.book_new();
            // Resumen (alineado al estilo de V2)
            const resumen = [];
            const totalLocalidades = (getFeatures(clippedLocalitiesLayer).length + getFeatures(clippedPointsLayer).length);
            const rows = [
                ['Localidades', totalLocalidades],
                ['Atlas de Pueblos Indígenas', getFeatures(clippedAtlasLayer).length],
                ['Regiones Indígenas', getFeatures(clippedRegionesLayer).length],
                ['Lenguas Indígenas (features)', getFeatures(clippedLenguasLayer).length],
                ['Localidades Indígenas (Datos)', getFeatures(clippedLocIndigenasLayer).length],
                ['Ruta Wixarika', getFeatures(clippedRutaWixarikaLayer).length]
            ];
            rows.forEach(r => { if (r[1] > 0) resumen.push({ Capa: r[0], Total: r[1] }); });
            if (resumen.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');

            // Lenguas (conteo único)
            const lenguasFeatures = getFeatures(clippedLenguasLayer);
            if (lenguasFeatures.length > 0) {
                const counts = new Map();
                lenguasFeatures.forEach(f => { const p = f.properties || {}; const nombre = (p.Lengua || p.LENGUA || 'Sin dato').toString().trim(); const key = nombre.toUpperCase(); counts.set(key, (counts.get(key) || 0) + 1); });
                const rowsLen = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(e => ({ Lengua: e[0], Conteo: e[1] }));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsLen), 'Lenguas (conteo)');

                // Lenguas (detalle de features)
                const lenguasDetalle = lenguasFeatures.map(f => {
                    const p = f.properties || {};
                    const out = {};
                    Object.keys(p).forEach(k => {
                        if (p[k] === null || p[k] === undefined) out[k] = 'sin dato'; else out[k] = p[k];
                    });
                    return out;
                });
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lenguasDetalle), 'Lenguas (detalle)');
            }

            // Localidades (detalle)
            const allLocalidades = [...getFeatures(clippedLocalitiesLayer), ...getFeatures(clippedPointsLayer)];
            if (allLocalidades.length > 0) {
                const localidadesRows = allLocalidades.map(f => {
                    const properties = f.properties || {};
                    const new_properties = {};
                    Object.keys(properties).forEach(key => {
                        if (properties[key] === null || properties[key] === undefined) {
                            if (['POBTOT', 'POBFEM', 'POBMAS'].includes(key)) new_properties[key] = 0; else new_properties[key] = 'sin dato';
                        } else {
                            new_properties[key] = properties[key];
                        }
                    });
                    return new_properties;
                });
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(localidadesRows), 'Localidades');
            }

            // Regiones Indígenas (detalle)
            const regionesFeatures = getFeatures(clippedRegionesLayer);
            if (regionesFeatures.length > 0) {
                const regionesRows = regionesFeatures.map(f => {
                    const p = f.properties || {}; const out = {};
                    Object.keys(p).forEach(k => { out[k] = (p[k] == null) ? 'sin dato' : p[k]; });
                    return out;
                });
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(regionesRows), 'Regiones Indígenas');
            }

            // Localidades Indígenas (Datos) (detalle)
            const locIndigFeatures = getFeatures(clippedLocIndigenasLayer);
            if (locIndigFeatures.length > 0) {
                const locIndRows = locIndigFeatures.map(f => {
                    const p = f.properties || {}; const out = {};
                    Object.keys(p).forEach(k => { out[k] = (p[k] == null) ? 'sin dato' : p[k]; });
                    return out;
                });
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(locIndRows), 'Localidades Indígenas (Datos)');
            }

            const fileName = 'reporte_v0_' + new Date().toISOString().split('T')[0] + '.xlsx';
            XLSX.writeFile(wb, fileName);
        } catch (e) { console.error('Excel error:', e); alert('No se pudo generar el Excel.'); }
    });
}

function clearAll() {
    [kmlLayer, clippedAtlasLayer, clippedRegionesLayer, clippedLenguasLayer, clippedLocIndigenasLayer, clippedRutaWixarikaLayer, clippedLocalitiesLayer, clippedPointsLayer, labelLayer, localidadesLayerGroup].forEach(l => { if (l) map.removeLayer(l); });
    kmlLayer = clippedAtlasLayer = clippedRegionesLayer = clippedLenguasLayer = clippedLocIndigenasLayer = clippedRutaWixarikaLayer = clippedLocalitiesLayer = clippedPointsLayer = labelLayer = localidadesLayerGroup = null;
    kmlGeoJson = null; lastAreaBounds = null;
    const layersContainer = document.getElementById('layersContainer');
    if (layersContainer) layersContainer.innerHTML = '<p class="mb-0 text-muted">Sube un KML para ejecutar el análisis automático.</p>';
    const downloadBtn = document.getElementById('downloadReportBtn'); if (downloadBtn) downloadBtn.disabled = true;
    if (layersControl) { map.removeControl(layersControl); }
    initMap();
}

function initApp() {
    initMap();
    loadIndigenousLayers();

    const kmlFileInput = document.getElementById('kmlFile');
    const uploadKmlBtn = document.getElementById('uploadKmlBtn');
    const centerKmlBtn = document.getElementById('centerKmlBtn');
    const clearMapBtn = document.getElementById('clearMap');

    if (kmlFileInput) kmlFileInput.value = '';
    if (uploadKmlBtn) uploadKmlBtn.disabled = true;
    if (centerKmlBtn) centerKmlBtn.disabled = true;

    if (kmlFileInput) kmlFileInput.addEventListener('change', () => { if (uploadKmlBtn) uploadKmlBtn.disabled = kmlFileInput.files.length === 0; });
    if (uploadKmlBtn) uploadKmlBtn.addEventListener('click', () => {
        if (kmlFileInput && kmlFileInput.files[0]) {
            // Disparar preloader como en otras versiones
            showPreloader();
            updateProgress(5, 'Leyendo KML…');
            setTimeout(() => processKmlFile(kmlFileInput.files[0]), 50);
        }
    });
    if (centerKmlBtn) centerKmlBtn.addEventListener('click', () => { if (kmlLayer) { const b = kmlLayer.getBounds(); if (b && b.isValid()) map.fitBounds(b, { padding: [24, 24], maxZoom: 15, animate: true, duration: 0.5 }); } });
    if (clearMapBtn) clearMapBtn.addEventListener('click', clearAll);

    wireExcelExport();

    // Scroll shadows for controls panel (desktop): subtle gradients when overflow
    setupControlsScrollShadows();
}

// Start app only after DOM is ready and #map exists
(function startWhenReady() {
    const start = () => {
        // Ensure #map exists before initializing
        const ensureMap = (tries = 20) => {
            if (document.getElementById('map')) { initApp(); }
            else if (tries > 0) { setTimeout(() => ensureMap(tries - 1), 50); }
            else { initApp(); }
        };
        ensureMap();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();

// --- UI: Scroll shadow helpers for controls accordion ---
let controlsScrollUpdate = null;
function setupControlsScrollShadows() {
    const container = document.querySelector('.sticky-lg-top .card-body');
    if (!container) return;
    container.classList.add('scroll-shadow');
    const update = () => {
        try {
            const canScroll = (container.scrollHeight - container.clientHeight) > 1;
            const atTop = container.scrollTop <= 0;
            const atBottom = Math.ceil(container.scrollTop + container.clientHeight) >= container.scrollHeight;
            container.classList.toggle('has-shadow-top', canScroll && !atTop);
            container.classList.toggle('has-shadow-bottom', canScroll && !atBottom);
        } catch (_) { }
    };
    controlsScrollUpdate = update;
    container.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const acc = document.getElementById('controlsAccordion');
    if (acc && window.bootstrap) {
        acc.addEventListener('shown.bs.collapse', update);
        acc.addEventListener('hidden.bs.collapse', update);
    } else if (acc) {
        acc.addEventListener('click', () => setTimeout(update, 0), { passive: true });
    }
    setTimeout(update, 0);
    setTimeout(update, 300);
}

// Ensure shadows update after rendering dynamic results
const _origUpdateLayersDisplay = updateLayersDisplay;
updateLayersDisplay = function () {
    _origUpdateLayersDisplay.apply(this, arguments);
    if (typeof controlsScrollUpdate === 'function') controlsScrollUpdate();
};
