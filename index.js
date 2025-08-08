// Variables de estado del mapa y datos
let map;
let localitiesData = null;
let kmlLayer = null;
let bufferLayer = null;
let clippedLocalitiesLayer = null;
let kmlGeoJson = null;
let labelLayer = null;

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
            </div>`;
        document.body.appendChild(pre);
    }
    pre.classList.remove('preloader-hide');
    pre.removeAttribute('hidden');
    pre.style.display = 'flex';
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
        const clearMapBtn = document.getElementById('clearMap');
        const cvegeoListDiv = document.getElementById('cvegeoList');

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
            const badge = document.getElementById('foundCountBadge');
            if (badge) badge.textContent = '0';
            const totalFound = document.getElementById('totalFound');
            if (totalFound) totalFound.textContent = '0';
            const currentCriteria = document.getElementById('currentCriteria');
            if (currentCriteria) currentCriteria.textContent = '—';
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
                if (!localitiesData) {
                    await loadLocalitiesData();
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
                    } catch (e) {
                        console.error('Error creando buffer:', e);
                        showAlert('No se pudo crear el buffer.', 'danger');
                        return;
                    }
                }

                const clipped = [];
                for (const loc of localitiesData.features) {
                    if (T.booleanIntersects(loc.geometry, clipArea.geometry)) {
                        clipped.push(loc);
                    }
                }

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
                            if (feature.properties?.CVEGEO) {
                                layer.bindPopup(`Localidad: ${feature.properties.NOM_LOC || '—'}<br>CVEGEO: ${feature.properties.CVEGEO}`);
                            }
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

                    setTimeout(() => { map.invalidateSize(); map.fitBounds(clippedLocalitiesLayer.getBounds()); }, 50);
                    displayCvegeoList(clipped, colorsById);
                    showAlert(`Recorte completado. Se encontraron ${clipped.length} localidades.`, 'success');
                } else {
                    showAlert('No se encontraron localidades dentro del área.', 'warning');
                    cvegeoListDiv.innerHTML = '<p class="mb-0">No se encontraron localidades dentro del área.</p>';
                    const badge = document.getElementById('foundCountBadge');
                    if (badge) badge.textContent = '0';
                    const totalFound = document.getElementById('totalFound');
                    if (totalFound) totalFound.textContent = '0';
                    const currentCriteria = document.getElementById('currentCriteria');
                    if (currentCriteria) currentCriteria.textContent = areaTypeSelect.options[areaTypeSelect.selectedIndex].text;
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
