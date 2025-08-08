// Variables de estado del mapa y datos
let map;
let localitiesData = null;
let kmlLayer = null;
let bufferLayer = null;
let clippedLocalitiesLayer = null;
let kmlGeoJson = null;
let labelLayer = null;
let lastAreaBounds = null; // para restaurar la vista del área

// Garantizar disponibilidad de Turf en tiempo de ejecución (fallback si CDN falla)
function loadScript(url) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = url;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('No se pudo cargar ' + url));
        document.head.appendChild(s);
    });
}

async function ensureTurf() {
    // Si ya existe, úsalo
    if (window.turf) return window.turf;
    const cdns = [
        'https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js',
        'https://unpkg.com/@turf/turf@6/turf.min.js'
    ];
    for (const url of cdns) {
        try {
            await loadScript(url);
            if (window.turf) return window.turf;
        } catch (_) { /* probar siguiente */ }
    }
    throw new Error('Turf no disponible');
}

// Utilidad: mostrar alertas Bootstrap de forma centralizada
function showAlert(message, type = 'info', timeoutMs = 4000) {
    // type: 'primary' | 'success' | 'danger' | 'warning' | 'info'
    const container = document.getElementById('alertContainer');
    if (!container) { alert(message); return; }
    const wrapper = document.createElement('div');
    wrapper.className = `alert alert-${type} alert-dismissible fade show shadow`;
    wrapper.setAttribute('role', 'alert');
    wrapper.innerHTML = `
        <div>${message}</div>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>
    `;
    container.appendChild(wrapper);
    if (timeoutMs > 0) setTimeout(() => {
        wrapper.classList.remove('show');
        wrapper.addEventListener('transitionend', () => wrapper.remove());
    }, timeoutMs);
    return wrapper;
}

// Utilidad: ocultar el preloader de forma robusta con transición
function hidePreloader() {
    const pre = document.getElementById('preloader');
    if (!pre) return;
    // Marcar como hidden y ocultar visualmente
    pre.setAttribute('hidden', '');
    if (pre.style.display === 'none') return;
    pre.classList.add('preloader-hide');
    // tras la transición, elimínalo del flujo
    setTimeout(() => {
        pre.style.display = 'none';
        if (typeof map !== 'undefined' && map) setTimeout(() => map.invalidateSize(), 100);
    }, 350);
}

// Utilidad: mostrar el preloader (si no existe lo crea)
function showPreloader() {
    let pre = document.getElementById('preloader');
    if (!pre) {
        // Crear un overlay sencillo con spinner y logos
        pre = document.createElement('div');
        pre.id = 'preloader';
        pre.className = 'position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-white';
        pre.style.zIndex = '2050';
        pre.innerHTML = `
            <div class="text-center">
                <img src="img/mujer.png" alt="Cargando" style="max-height: 120px; object-fit: contain;" class="mb-3">
                <div class="spinner-border text-primary" role="status" aria-label="Cargando"></div>
                <p class="mt-3 mb-0">Procesando…</p>
                <div class="progress mt-3 mx-auto" style="height: 10px; width: min(80vw, 420px);">
                    <div id="preProgressBar" class="progress-bar bg-success" role="progressbar" style="width: 0%;"
                        aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
                </div>
                <p id="preloaderMessage" class="mt-2 mb-0 small text-muted">Preparando…</p>
            </div>`;
        document.body.appendChild(pre);
    }
    pre.classList.remove('preloader-hide');
    pre.removeAttribute('hidden');
    pre.style.display = 'flex';
}

function updateProgress(percent, message) {
    const bar = document.getElementById('preProgressBar');
    const msg = document.getElementById('preloaderMessage');
    if (bar) {
        bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
        bar.setAttribute('aria-valuenow', String(Math.round(percent)));
    }
    if (msg && typeof message === 'string') {
        msg.textContent = message;
    }
}

// Nota: el preloader está oculto por defecto; se muestra sólo en procesos largos (p.ej. recorte)

document.addEventListener('DOMContentLoaded', () => {
    try {
        // Garantizar que el preloader no bloquee la vista al iniciar
        hidePreloader();
        map = L.map("map").setView([24.1, -102], 6);

        const base = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        const localitiesUrl = 'https://cdn.sassoapps.com/Gabvy/localidades_4326.geojson';

        const kmlFileInput = document.getElementById('kmlFile');
        const uploadKmlBtn = document.getElementById('uploadKmlBtn');
        const areaTypeSelect = document.getElementById('areaType');
        const performClipBtn = document.getElementById('performClipBtn');
        const resetViewBtn = document.getElementById('resetViewBtn');
        const clearMapBtn = document.getElementById('clearMap');
        const cvegeoListDiv = document.getElementById('cvegeoList');
        let featureLayersById = new Map(); // CVEGEO -> {bounds|latlng}

        if (uploadKmlBtn) uploadKmlBtn.disabled = true;
        if (performClipBtn) performClipBtn.disabled = true;

        async function loadLocalitiesData() {
            try {
                const response = await fetch(localitiesUrl);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                localitiesData = await response.json();
                console.log(`Localidades cargadas: ${localitiesData.features.length}`);
                showAlert(`Localidades cargadas: ${localitiesData.features.length}`, 'success');
            } catch (error) {
                console.error('Error al cargar localidades:', error);
                showAlert('Error al cargar localidades desde el servidor.', 'danger', 6000);
            }
        }

        function clearAllLayers() {
            if (kmlLayer) map.removeLayer(kmlLayer);
            if (bufferLayer) map.removeLayer(bufferLayer);
            if (clippedLocalitiesLayer) map.removeLayer(clippedLocalitiesLayer);
            if (labelLayer) map.removeLayer(labelLayer);
            kmlLayer = null;
            bufferLayer = null;
            clippedLocalitiesLayer = null;
            labelLayer = null;
            kmlGeoJson = null;
            cvegeoListDiv.innerHTML = '<p class="mb-0 text-muted">Sube un KML y realiza el recorte para ver la lista.</p>';
            uploadKmlBtn.disabled = true;
            performClipBtn.disabled = true;
            if (resetViewBtn) resetViewBtn.disabled = true;
            lastAreaBounds = null;
            const badge = document.getElementById('foundCountBadge');
            if (badge) badge.textContent = '0';
            const totalFound = document.getElementById('totalFound');
            if (totalFound) totalFound.textContent = '0';
            const currentCriteria = document.getElementById('currentCriteria');
            if (currentCriteria) currentCriteria.textContent = '—';
        }

        function setActiveListItem(targetId) {
            const items = cvegeoListDiv.querySelectorAll('li');
            items.forEach(li => {
                if (li.dataset.cvegeo === targetId) {
                    li.classList.add('active');
                    try { li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) { /* opcional */ }
                } else {
                    li.classList.remove('active');
                }
            });
        }

        function displayCvegeoList(features, colorsById) {
            if (features.length === 0) {
                cvegeoListDiv.innerHTML = '<p>No se encontraron localidades dentro del área.</p>';
                return;
            }
            const ul = document.createElement('ul');
            features.forEach(f => {
                if (f.properties.CVEGEO) {
                    const li = document.createElement('li');
                    const color = colorsById.get(f.properties.CVEGEO) || '#008000';
                    li.innerHTML = `<span class="color-dot" style="background:${color}"></span>${f.properties.CVEGEO}`;
                    li.dataset.cvegeo = f.properties.CVEGEO;
                    ul.appendChild(li);
                }
            });
            cvegeoListDiv.innerHTML = '';
            cvegeoListDiv.appendChild(ul);
            const badge = document.getElementById('foundCountBadge');
            if (badge) badge.textContent = String(features.length);
            const totalFound = document.getElementById('totalFound');
            if (totalFound) totalFound.textContent = String(features.length);
            const currentCriteria = document.getElementById('currentCriteria');
            if (currentCriteria) currentCriteria.textContent = areaTypeSelect.options[areaTypeSelect.selectedIndex].text;

            // Click en elemento de la lista: centrar en esa localidad
            ul.querySelectorAll('li').forEach(li => {
                li.addEventListener('click', () => {
                    const id = li.dataset.cvegeo;
                    const ref = featureLayersById.get(id);
                    if (!ref) return;
                    setActiveListItem(id);
                    if (ref.bounds && ref.bounds.isValid()) {
                        map.fitBounds(ref.bounds.pad(0.25), { animate: true, duration: 0.5, maxZoom: 14 });
                    } else if (ref.latlng) {
                        map.panTo(ref.latlng, { animate: true, duration: 0.5 });
                    }
                    if (ref.layer && ref.layer.openPopup) {
                        ref.layer.openPopup();
                    }
                });
            });
        }

        function processKmlFile(file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const kmlText = e.target.result;
                    const kmlDom = new DOMParser().parseFromString(kmlText, 'text/xml');
                    kmlGeoJson = toGeoJSON.kml(kmlDom);

                    const kmlPolygon = kmlGeoJson.features.find(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');
                    if (!kmlPolygon) {
                        showAlert('El archivo KML no contiene un polígono válido.', 'warning');
                        performClipBtn.disabled = true;
                        return;
                    }

                    if (kmlLayer) map.removeLayer(kmlLayer);
                    kmlLayer = L.geoJSON(kmlPolygon, {
                        style: {
                            color: '#ff7800',
                            weight: 3,
                            fillColor: '#ffa500',
                            fillOpacity: 0.2
                        }
                    }).addTo(map);

                    // Asegurar que el mapa calcula su tamaño si estaba oculto por el preloader/accordion
                    setTimeout(() => { map.invalidateSize(); map.fitBounds(kmlLayer.getBounds()); }, 50);
                    performClipBtn.disabled = false;
                    showAlert('KML cargado y visualizado correctamente.', 'success');
                } catch (error) {
                    console.error('Error procesando KML:', error);
                    showAlert('Error procesando el archivo KML.', 'danger', 6000);
                }
            };
            reader.readAsText(file);
        }

        async function performClipping() {
            // Mostrar preloader durante el procesamiento del recorte
            showPreloader();
            updateProgress(5, 'Validando insumos…');
            // Validar que ya se cargó un KML
            if (!kmlGeoJson) {
                showAlert('Primero carga un archivo KML válido.', 'warning');
                hidePreloader();
                return;
            }

            // Cargar localidades bajo demanda si aún no están en memoria
            try {
                // Asegurar Turf
                const T = await ensureTurf();
                updateProgress(15, 'Realizando el análisis, por favor espere…');
                if (!localitiesData) {
                    await loadLocalitiesData();
                    updateProgress(35, 'Localidades cargadas. Preparando geometrías…');
                    if (!localitiesData) return; // si falló la carga, abortar
                }

                if (bufferLayer) map.removeLayer(bufferLayer);
                if (clippedLocalitiesLayer) map.removeLayer(clippedLocalitiesLayer);
                if (labelLayer) map.removeLayer(labelLayer);

                const areaType = areaTypeSelect.value;
                const kmlPolygon = kmlGeoJson.features.find(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');
                let clipArea = kmlPolygon;

                if (areaType === 'nucleo') {
                    try {
                        const buffer = T.buffer(kmlPolygon, 500, { units: 'meters' });
                        clipArea = buffer;
                        bufferLayer = L.geoJSON(buffer, {
                            style: {
                                color: '#0078ff',
                                weight: 2,
                                fillColor: '#0078ff',
                                fillOpacity: 0.1
                            }
                        }).addTo(map);
                        updateProgress(55, 'Buffer generado. Intersectando…');
                    } catch (e) {
                        console.error('Error creando buffer:', e);
                        showAlert('No se pudo crear el buffer.', 'danger');
                        return;
                    }
                }

                const clipped = [];
                const total = localitiesData.features.length;
                let processed = 0;
                const step = Math.max(50, Math.floor(total / 200)); // actualiza con frecuencia razonable
                for (const loc of localitiesData.features) {
                    if (T.booleanIntersects(loc.geometry, clipArea.geometry)) {
                        clipped.push(loc);
                    }
                    processed++;
                    if (processed % step === 0 || processed === total) {
                        const pct = 55 + Math.min(35, (processed / Math.max(1, total)) * 35);
                        updateProgress(pct, `Procesando localidades… ${processed}/${total}`);
                    }
                }
                updateProgress(90, `Encontradas ${clipped.length}. Dibujando…`);

                if (clipped.length > 0) {
                    // Generar una paleta de colores distinta por CVEGEO
                    const colorsById = new Map();
                    const palette = [
                        '#d11149', '#1a8fe3', '#119822', '#ff7f0e', '#9467bd', '#e377c2', '#17becf', '#bcbd22', '#8c564b', '#2ca02c',
                        '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf', '#999999', '#66c2a5', '#fc8d62'
                    ];
                    let i = 0;
                    for (const f of clipped) {
                        const id = f.properties?.CVEGEO || String(i);
                        if (!colorsById.has(id)) {
                            colorsById.set(id, palette[i % palette.length]);
                            i++;
                        }
                    }

                    // Capa de puntos con color propio y popup
                    featureLayersById = new Map();
                    const clippedCollection = T.featureCollection(clipped);
                    clippedLocalitiesLayer = L.geoJSON(clippedCollection, {
                        // Estilo para polígonos/líneas por CVEGEO
                        style: (feature) => {
                            const id = feature.properties?.CVEGEO;
                            const color = (id && colorsById.get(id)) || '#008000';
                            return {
                                color,
                                weight: 2,
                                opacity: 0.9,
                                fillColor: color,
                                fillOpacity: 0.25
                            };
                        },
                        // Puntos con color propio
                        pointToLayer: (feature, latlng) => {
                            const id = feature.properties?.CVEGEO;
                            const color = (id && colorsById.get(id)) || '#008000';
                            return L.circleMarker(latlng, {
                                radius: 6,
                                fillColor: color,
                                color: '#222',
                                weight: 1,
                                opacity: 1,
                                fillOpacity: 0.9
                            });
                        },
                        onEachFeature: (feature, layer) => {
                            if (feature.properties) {
                                const props = feature.properties;
                                const nombre = props.NOM_LOC || props.NOMGEO || props.NOMBRE || '—';
                                const cvegeo = props.CVEGEO || '—';
                                const ambito = props.AMBITO || '—';
                                layer.bindPopup(`Nombre: <strong>${nombre}</strong><br>CVEGEO: <strong>${cvegeo}</strong><br>Ámbito: <strong>${ambito}</strong>`);
                                const id = props.CVEGEO;
                                const ref = { layer };
                                if (layer.getBounds) {
                                    const b = layer.getBounds();
                                    if (b && b.isValid()) ref.bounds = b;
                                } else if (layer.getLatLng) {
                                    ref.latlng = layer.getLatLng();
                                }
                                if (id) featureLayersById.set(id, ref);
                            }
                            // Click: centra suavemente sin zoom agresivo
                            layer.on('click', () => {
                                const id = feature.properties?.CVEGEO;
                                if (id) setActiveListItem(id);
                                if (layer.getBounds) {
                                    const b = layer.getBounds();
                                    if (b && b.isValid()) {
                                        map.fitBounds(b.pad(0.25), { animate: true, duration: 0.5, maxZoom: 14 });
                                        return;
                                    }
                                }
                                if (layer.getLatLng) {
                                    map.panTo(layer.getLatLng(), { animate: true, duration: 0.5 });
                                }
                                if (layer.openPopup) layer.openPopup();
                            });
                        }
                    }).addTo(map);

                    // Capa de etiquetas (CVEGEO) usando DivIcon
                    const labels = [];
                    clipped.forEach(f => {
                        if (f.geometry.type === 'Point') {
                            const [lng, lat] = f.geometry.coordinates;
                            const id = f.properties?.CVEGEO;
                            const color = (id && colorsById.get(id)) || '#008000';
                            const icon = L.divIcon({
                                className: 'cvegeo-label',
                                html: `<span style="background:${color};color:#fff;padding:2px 4px;border-radius:3px;font-size:11px;">${id || ''}</span>`
                            });
                            labels.push(L.marker([lat, lng], { icon }));
                        } else if (f.geometry.type === 'MultiPoint') {
                            f.geometry.coordinates.forEach(([lng, lat]) => {
                                const id = f.properties?.CVEGEO;
                                const color = (id && colorsById.get(id)) || '#008000';
                                const icon = L.divIcon({
                                    className: 'cvegeo-label',
                                    html: `<span style=\"background:${color};color:#fff;padding:2px 4px;border-radius:3px;font-size:11px;\">${id || ''}</span>`
                                });
                                labels.push(L.marker([lat, lng], { icon }));
                            });
                        } else if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
                            try {
                                const centroid = T.centroid(f);
                                const [lng, lat] = centroid.geometry.coordinates;
                                const id = f.properties?.CVEGEO;
                                const color = (id && colorsById.get(id)) || '#008000';
                                const icon = L.divIcon({
                                    className: 'cvegeo-label',
                                    html: `<span style=\"background:${color};color:#fff;padding:2px 4px;border-radius:3px;font-size:11px;\">${id || ''}</span>`
                                });
                                labels.push(L.marker([lat, lng], { icon }));
                            } catch (e) {
                                // si falla el centróide, ignorar esa etiqueta
                            }
                        }
                    });
                    if (labels.length) labelLayer = L.layerGroup(labels).addTo(map);

                    // Guarda bounds del área y habilita restaurar vista
                    lastAreaBounds = clippedLocalitiesLayer.getBounds();
                    if (resetViewBtn) resetViewBtn.disabled = !lastAreaBounds || !lastAreaBounds.isValid();
                    setTimeout(() => { map.invalidateSize(); if (lastAreaBounds) map.fitBounds(lastAreaBounds); }, 50);
                    displayCvegeoList(clipped, colorsById);
                    showAlert(`Recorte completado. Se encontraron ${clipped.length} localidades.`, 'success');
                    updateProgress(100, 'Listo.');
                } else {
                    showAlert('No se encontraron localidades dentro del área.', 'warning');
                    cvegeoListDiv.innerHTML = '<p class="mb-0">No se encontraron localidades dentro del área.</p>';
                    const badge = document.getElementById('foundCountBadge');
                    if (badge) badge.textContent = '0';
                    const totalFound = document.getElementById('totalFound');
                    if (totalFound) totalFound.textContent = '0';
                    const currentCriteria = document.getElementById('currentCriteria');
                    if (currentCriteria) currentCriteria.textContent = areaTypeSelect.options[areaTypeSelect.selectedIndex].text;
                    updateProgress(100, 'Sin coincidencias.');
                    lastAreaBounds = null;
                    if (resetViewBtn) resetViewBtn.disabled = true;
                }
            } catch (err) {
                console.error('Error durante el recorte:', err);
                showAlert('Ocurrió un error durante el recorte. Revisa la consola para más detalle.', 'danger', 7000);
            } finally {
                // Ocultar preloader al finalizar el flujo
                hidePreloader();
            }
        }

        // EVENTOS
        kmlFileInput.addEventListener('change', () => {
            uploadKmlBtn.disabled = kmlFileInput.files.length === 0;
        });

        uploadKmlBtn.addEventListener('click', () => {
            const file = kmlFileInput.files[0];
            if (file) processKmlFile(file);
            else showAlert('Selecciona un archivo KML.', 'info');
        });

        performClipBtn.addEventListener('click', () => {
            // Evitar múltiples ejecuciones simultáneas
            performClipBtn.disabled = true;
            Promise.resolve().then(() => performClipping()).finally(() => {
                // re-habilitar sólo si hay KML cargado
                performClipBtn.disabled = !kmlGeoJson;
            });
        });
        if (resetViewBtn) {
            resetViewBtn.addEventListener('click', () => {
                if (lastAreaBounds && lastAreaBounds.isValid()) {
                    map.fitBounds(lastAreaBounds, { animate: true, duration: 0.5 });
                }
            });
        }
        clearMapBtn.addEventListener('click', () => {
            clearAllLayers();
            showAlert('Mapa limpiado.', 'info');
        });

    } catch (err) {
        console.error('Error inicializando la app:', err);
        showAlert('Ocurrió un error inicializando la aplicación.', 'danger', 7000);
        hidePreloader();
    }
});

// Failsafes adicionales: si por alguna razón sigue visible, ocultarlo cuando termine de cargar todo
window.addEventListener('load', () => {
    hidePreloader();
});

// Y un último intento tras 1 segundo
setTimeout(() => hidePreloader(), 1000);
