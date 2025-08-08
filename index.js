// Variables de estado del mapa y datos
let map;
let localitiesData = null;
let kmlLayer = null;
let bufferLayer = null;
let clippedLocalitiesLayer = null;
let kmlGeoJson = null;

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
            kmlLayer = null;
            bufferLayer = null;
            clippedLocalitiesLayer = null;
            kmlGeoJson = null;
            cvegeoListDiv.innerHTML = '<p class="mb-0 text-muted">Sube un KML y realiza el recorte para ver la lista.</p>';
            uploadKmlBtn.disabled = true;
            performClipBtn.disabled = true;
        }

        function displayCvegeoList(features) {
            if (features.length === 0) {
                cvegeoListDiv.innerHTML = '<p>No se encontraron localidades dentro del área.</p>';
                return;
            }
            const ul = document.createElement('ul');
            features.forEach(f => {
                if (f.properties.CVEGEO) {
                    const li = document.createElement('li');
                    li.textContent = f.properties.CVEGEO;
                    ul.appendChild(li);
                }
            });
            cvegeoListDiv.innerHTML = '';
            cvegeoListDiv.appendChild(ul);
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
                if (!localitiesData) {
                    await loadLocalitiesData();
                    if (!localitiesData) return; // si falló la carga, abortar
                }

                if (bufferLayer) map.removeLayer(bufferLayer);
                if (clippedLocalitiesLayer) map.removeLayer(clippedLocalitiesLayer);

                const areaType = areaTypeSelect.value;
                const kmlPolygon = kmlGeoJson.features.find(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');
                let clipArea = kmlPolygon;

                if (areaType === 'nucleo') {
                    try {
                        const buffer = turf.buffer(kmlPolygon, 500, { units: 'meters' });
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
                    if (turf.booleanIntersects(loc.geometry, clipArea.geometry)) {
                        clipped.push(loc);
                    }
                }

                if (clipped.length > 0) {
                    const clippedCollection = turf.featureCollection(clipped);
                    clippedLocalitiesLayer = L.geoJSON(clippedCollection, {
                        pointToLayer: (feature, latlng) =>
                            L.circleMarker(latlng, {
                                radius: 6,
                                fillColor: '#008000',
                                color: '#000',
                                weight: 1,
                                opacity: 1,
                                fillOpacity: 0.8
                            }),
                        onEachFeature: (feature, layer) => {
                            if (feature.properties?.CVEGEO) {
                                layer.bindPopup(`Localidad: ${feature.properties.NOM_LOC}<br>CVEGEO: ${feature.properties.CVEGEO}`);
                            }
                        }
                    }).addTo(map);

                    setTimeout(() => { map.invalidateSize(); map.fitBounds(clippedLocalitiesLayer.getBounds()); }, 50);
                    displayCvegeoList(clipped);
                    showAlert(`Recorte completado. Se encontraron ${clipped.length} localidades.`, 'success');
                } else {
                    showAlert('No se encontraron localidades dentro del área.', 'warning');
                    cvegeoListDiv.innerHTML = '<p class="mb-0">No se encontraron localidades dentro del área.</p>';
                }
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
