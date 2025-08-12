/**
 * GEOVISUALIZADOR DE ÁREAS DE INTERÉS - VERSIÓN MULTICAPA
 * ========================================================
 * 
 * Sistema para la visualización y análisis geoespacial de múltiples capas
 * en relación con áreas de interés definidas por archivos KML.
 */

// ============================================================================
// VARIABLES DE ESTADO GLOBAL
// ============================================================================

let map; // Instancia principal del mapa Leaflet
let kmlLayer = null; // Capa del polígono KML original cargado por el usuario
let bufferLayer = null; // Capa del buffer generado para área núcleo
let kmlGeoJson = null; // Datos GeoJSON convertidos del KML original
let lastAreaBounds = null; // Bounds del área para restaurar la vista del área

// ============================================================================
// UTILIDAD DE FORMATEO NUMÉRICO (separador de miles)
// ============================================================================
function formatNumber(n) {
    if (n == null || isNaN(n)) return '0';
    try { return n.toLocaleString('es-MX'); } catch (_) { return String(n); }
}

// Datos originales de cada capa
let localitiesData = null;
let atlasData = null;
let municipiosData = null;
let regionesData = null;
let ranData = null;
let lenguasData = null;

// Capas recortadas
let clippedLocalitiesLayer = null;
let clippedAtlasLayer = null;
let clippedMunicipiosLayer = null;
let clippedRegionesLayer = null;
let clippedRanLayer = null;
let clippedLenguasLayer = null;

// Control de capas
let overlaysControl = null;

// Mapa para mantener referencias de features por ID (para navegación)
let featureLayersById = new Map();

// Capa de highlight para elementos seleccionados
let highlightLayer = null;

// ============================================================================
// UTILIDADES PARA CARGA DE DEPENDENCIAS
// ============================================================================

/**
 * Carga dinámicamente un script JavaScript de forma asíncrona
 */
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

/**
 * Garantiza la disponibilidad de Turf.js con fallback a múltiples CDNs
 */
async function ensureTurf() {
    if (window.turf) return window.turf;
    const cdns = [
        'https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js',
        'https://unpkg.com/@turf/turf@6/turf.min.js'
    ];
    for (const url of cdns) {
        try {
            await loadScript(url);
            if (window.turf) return window.turf;
        } catch (_) { /* Continuar con el siguiente CDN */ }
    }
    throw new Error('Turf no disponible desde ningún CDN');
}

// ============================================================================
// SISTEMA DE ALERTAS Y FEEDBACK VISUAL
// ============================================================================

/**
 * Muestra alertas Bootstrap de forma centralizada con auto-dismiss
 */
function showAlert(message, type = 'info', timeoutMs = 4000) {
    const container = document.getElementById('alertContainer');
    if (!container) {
        alert(message);
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = `alert alert-${type} alert-dismissible fade show shadow`;
    wrapper.setAttribute('role', 'alert');
    wrapper.innerHTML = `
        <div>${message}</div>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>
    `;

    container.appendChild(wrapper);

    if (timeoutMs > 0) {
        setTimeout(() => {
            wrapper.classList.remove('show');
            wrapper.addEventListener('transitionend', () => wrapper.remove());
        }, timeoutMs);
    }

    return wrapper;
}

/**
 * Muestra modal Bootstrap reutilizable
 */
function showModal({ title = 'Aviso', message = '', okText = 'Aceptar', onOk = null } = {}) {
    const modalEl = document.getElementById('appModal');
    if (!modalEl) { showAlert(message, 'info', 5000); return; }
    const titleEl = document.getElementById('appModalLabel');
    const bodyEl = document.getElementById('appModalBody');
    const okBtn = document.getElementById('appModalOkBtn');
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = message;
    if (okBtn) {
        okBtn.textContent = okText;
        okBtn.onclick = () => { if (onOk) try { onOk(); } catch (_) { } };
    }
    try {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    } catch (_) {
        showAlert(message, 'info', 5000);
    }
}

/**
 * Oculta el preloader de forma robusta con transición suave
 */
function hidePreloader() {
    const pre = document.getElementById('preloader');
    if (!pre) return;

    pre.setAttribute('hidden', '');
    if (pre.style.display === 'none') return;

    pre.classList.add('preloader-hide');

    setTimeout(() => {
        pre.style.display = 'none';
        if (typeof map !== 'undefined' && map) {
            setTimeout(() => map.invalidateSize(), 100);
        }
    }, 350);
}

/**
 * Muestra el preloader durante operaciones largas
 */
function showPreloader() {
    let pre = document.getElementById('preloader');

    if (!pre) {
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

/**
 * Actualiza la barra de progreso y mensaje del preloader
 */
function updateProgress(percent, message) {
    const bar = document.getElementById('preProgressBar');
    const msg = document.getElementById('preloaderMessage');

    if (bar) {
        const clampedPercent = Math.max(0, Math.min(100, percent));
        bar.style.width = `${clampedPercent}%`;
        bar.setAttribute('aria-valuenow', String(Math.round(clampedPercent)));
    }

    if (msg && typeof message === 'string') {
        msg.textContent = message;
    }
}

// ============================================================================
// FUNCIÓN PRINCIPAL DE INICIALIZACIÓN
// ============================================================================

/**
 * Inicializa la aplicación: configura el mapa, enlaces de eventos y carga inicial
 */
function initApp() {
    try {
        // Solo ocultar preloader si no hay operaciones en curso
        if (!document.getElementById('preloader')?.style.display || document.getElementById('preloader').style.display === 'none') {
            hidePreloader();
        }

        // ====================================================================
        // CONFIGURACIÓN DEL MAPA BASE
        // ====================================================================

        map = L.map("map").setView([24.1, -102], 6);

        /**
         * Asegurar que el mapa calcule su tamaño correctamente
         */
        (function ensureMapSized(attempt = 0) {
            if (!map) return;

            const el = document.getElementById('map');
            const ready = el && el.clientHeight > 40;
            map.invalidateSize();

            if (!ready && attempt < 10) {
                setTimeout(() => ensureMapSized(attempt + 1), 150);
            }
        })();

        window.addEventListener('load', () => {
            setTimeout(() => map && map.invalidateSize(), 100);
        });

        const base = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        overlaysControl = L.control.layers(null, null, { collapsed: false }).addTo(map);

        // ====================================================================
        // CONFIGURACIÓN DE DATOS Y ELEMENTOS DEL DOM
        // ====================================================================

        const urls = {
            localidades: 'https://cdn.sassoapps.com/Gabvy/localidades_4326.geojson',
            atlas: 'https://cdn.sassoapps.com/Gabvy/atlaspueblosindigenas.geojson',
            municipios: 'https://cdn.sassoapps.com/Gabvy/municipios_4326.geojson',
            regiones: 'https://cdn.sassoapps.com/Gabvy/regionesindigenas.geojson',
            ran: 'https://cdn.sassoapps.com/Gabvy/RAN_4326.geojson',
            lenguas: 'https://cdn.sassoapps.com/Gabvy/lenguasindigenas.geojson'
        };

        const kmlFileInput = document.getElementById('kmlFile');
        const uploadKmlBtn = document.getElementById('uploadKmlBtn');
        const performClipBtn = document.getElementById('performClipBtn');
        const clearMapBtn = document.getElementById('clearMap');
        const areaTypeSelect = document.getElementById('areaType');
        const centerKmlBtn = document.getElementById('centerKmlBtn');
        const resetViewBtn = document.getElementById('resetViewBtn');
        const layersContainer = document.getElementById('layersContainer');
        const reloadDataBtn = document.getElementById('reloadDataBtn');

        // Estado inicial: limpiar input KML y deshabilitar botones hasta que se carguen datos
        if (kmlFileInput) kmlFileInput.value = '';
        if (uploadKmlBtn) uploadKmlBtn.disabled = true;
        if (performClipBtn) performClipBtn.disabled = true;

        // ====================================================================
        // FUNCIONES DE MANEJO DE DATOS GEOESPACIALES
        // ====================================================================

        /**
         * Carga los datos de todas las capas desde el servidor de forma asíncrona
         */
        /**
         * Carga una capa individual con manejo de errores robusto
         */
        async function loadSingleLayer(url, name) {
            try {
                console.log(`Cargando ${name} desde: ${url}`);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos timeout

                const response = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        'Accept': 'application/json',
                        'Cache-Control': 'no-cache'
                    }
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                console.log(`${name} cargado exitosamente: ${data.features?.length || 0} features`);
                return data;

            } catch (error) {
                console.error(`Error cargando ${name}:`, error);
                if (error.name === 'AbortError') {
                    throw new Error(`Timeout cargando ${name} (10s)`);
                }
                throw new Error(`Error cargando ${name}: ${error.message}`);
            }
        }

        async function loadDataOptional() {
            try {
                showPreloader();
                updateProgress(5, 'Iniciando carga de capas geoespaciales...');

                // Cargar capas secuencialmente para evitar problemas de concurrencia
                updateProgress(10, 'Cargando localidades...');
                localitiesData = await loadSingleLayer(urls.localidades, 'Localidades');

                updateProgress(25, 'Cargando atlas pueblos indígenas...');
                atlasData = await loadSingleLayer(urls.atlas, 'Atlas Pueblos Indígenas');

                updateProgress(40, 'Cargando municipios...');
                municipiosData = await loadSingleLayer(urls.municipios, 'Municipios');

                updateProgress(55, 'Cargando regiones indígenas...');
                regionesData = await loadSingleLayer(urls.regiones, 'Regiones Indígenas');

                updateProgress(70, 'Cargando RAN...');
                ranData = await loadSingleLayer(urls.ran, 'RAN');

                updateProgress(85, 'Cargando lenguas indígenas...');
                lenguasData = await loadSingleLayer(urls.lenguas, 'Lenguas Indígenas');

                updateProgress(100, 'Todas las capas cargadas exitosamente');
                console.log("Todas las capas cargadas correctamente.");
                showAlert('Todas las capas geoespaciales han sido cargadas exitosamente', 'success');

                setTimeout(hidePreloader, 800);

            } catch (err) {
                console.error("Error cargando capas:", err);
                updateProgress(0, 'Error en la carga');

                let errorMessage = 'Error al cargar capas desde el servidor.';
                if (err.message.includes('Timeout')) {
                    errorMessage = 'Timeout al cargar capas. El servidor tardó demasiado en responder.';
                } else if (err.message.includes('HTTP')) {
                    errorMessage = 'Error del servidor al cargar capas. Verifica que las URLs sean correctas.';
                } else if (err.message.includes('Failed to fetch')) {
                    errorMessage = 'Error de conexión. Verifica tu conexión a internet y que el servidor esté disponible.';
                }

                showAlert(errorMessage, 'warning', 6000);
                hidePreloader();

                // Usar datos de ejemplo para desarrollo
                console.warn('Carga de datos externos falló. Usando datos de ejemplo para desarrollo.');
                createSampleData();
            }
        }

        /**
         * Crea datos de ejemplo para desarrollo cuando no hay conexión a los servidores
         */
        function createSampleData() {
            console.log('Creando datos de ejemplo para desarrollo...');

            // Datos de ejemplo para México
            localitiesData = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: {
                            CVEGEO: "09001001",
                            NOM_LOC: "Ciudad de México",
                            NOM_MUN: "Álvaro Obregón",
                            NOM_ENT: "Ciudad de México"
                        },
                        geometry: {
                            type: "Point",
                            coordinates: [-99.1332, 19.4326]
                        }
                    },
                    {
                        type: "Feature",
                        properties: {
                            CVEGEO: "14001001",
                            NOM_LOC: "Guadalajara",
                            NOM_MUN: "Guadalajara",
                            NOM_ENT: "Jalisco"
                        },
                        geometry: {
                            type: "Point",
                            coordinates: [-103.3496, 20.6597]
                        }
                    }
                ]
            };

            municipiosData = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: {
                            CVEGEO: "09001",
                            NOM_MUN: "Álvaro Obregón",
                            NOM_ENT: "Ciudad de México"
                        },
                        geometry: {
                            type: "Polygon",
                            coordinates: [[
                                [-99.15, 19.40], [-99.10, 19.40], [-99.10, 19.45], [-99.15, 19.45], [-99.15, 19.40]
                            ]]
                        }
                    }
                ]
            };

            lenguasData = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: {
                            Lengua: "Náhuatl",
                            NOM_LOC: "Ciudad de México",
                            NOM_MUN: "Álvaro Obregón",
                            NOM_ENT: "Ciudad de México"
                        },
                        geometry: {
                            type: "Point",
                            coordinates: [-99.1332, 19.4326]
                        }
                    },
                    {
                        type: "Feature",
                        properties: {
                            Lengua: "Maya",
                            NOM_LOC: "Guadalajara",
                            NOM_MUN: "Guadalajara",
                            NOM_ENT: "Jalisco"
                        },
                        geometry: {
                            type: "Point",
                            coordinates: [-103.3496, 20.6597]
                        }
                    }
                ]
            };

            // Inicializar otras capas como vacías
            atlasData = { type: "FeatureCollection", features: [] };
            regionesData = { type: "FeatureCollection", features: [] };
            ranData = { type: "FeatureCollection", features: [] };

            showAlert('Usando datos de ejemplo para desarrollo. Carga un KML para probar la funcionalidad.', 'info', 5000);
        }

        // Cargar datos al inicializar (opcional para desarrollo)
        // Comentar esta línea si quieres trabajar solo con KML sin datos externos
        loadDataOptional();

        // ====================================================================
        // FUNCIONES DE NAVEGACIÓN Y VISUALIZACIÓN
        // ====================================================================

        /**
         * Obtiene el nombre de visualización amigable para una capa
         */
        function getLayerDisplayName(layerName) {
            const displayNames = {
                'localidades': 'Localidades',
                'atlas': 'Atlas Pueblos Indígenas',
                'municipios': 'Municipios',
                'regiones': 'Regiones Indígenas',
                'ran': 'RAN',
                'lenguas': 'Lenguas Indígenas'
            };
            return displayNames[layerName] || layerName;
        }

        /**
         * Navega a una feature específica en el mapa con highlight visual
         */
        function navigateToFeature(featureId, layerName, features, propertyName) {
            let targetFeatures = [];

            if (layerName === 'lenguas') {
                // Para lenguas, buscar todos los puntos de esa lengua
                targetFeatures = features.filter(f => f.properties[propertyName] === featureId);
            } else {
                // Para otras capas, buscar la feature específica
                targetFeatures = features.filter(f => f.properties[propertyName] === featureId);
            }

            if (targetFeatures.length === 0) return;

            // Activar automáticamente la capa correspondiente si no está visible
            const layerMapping = {
                'localidades': clippedLocalitiesLayer,
                'atlas': clippedAtlasLayer,
                'municipios': clippedMunicipiosLayer,
                'regiones': clippedRegionesLayer,
                'ran': clippedRanLayer,
                'lenguas': clippedLenguasLayer
            };

            const correspondingLayer = layerMapping[layerName];
            if (correspondingLayer && !map.hasLayer(correspondingLayer)) {
                map.addLayer(correspondingLayer);
                showAlert(`Capa "${getLayerDisplayName(layerName)}" activada automáticamente`, 'info', 2000);
            }

            // Remover highlight anterior si existe
            if (highlightLayer) {
                map.removeLayer(highlightLayer);
                highlightLayer = null;
            }

            // Crear bounds que incluyan todas las features encontradas
            const group = L.featureGroup();
            targetFeatures.forEach(f => {
                const layer = L.geoJSON(f);
                group.addLayer(layer);
            });

            const bounds = group.getBounds();
            if (bounds.isValid()) {
                // Crear capa de highlight con estilo llamativo
                highlightLayer = L.geoJSON(targetFeatures, {
                    style: function (feature) {
                        return {
                            color: '#ffff00',        // Amarillo brillante
                            weight: 4,
                            opacity: 1,
                            fillColor: '#ffff00',
                            fillOpacity: 0.3,
                            dashArray: '10,5'        // Línea punteada
                        };
                    },
                    pointToLayer: function (feature, latlng) {
                        return L.circleMarker(latlng, {
                            radius: 12,
                            color: '#ffff00',
                            weight: 4,
                            opacity: 1,
                            fillColor: '#ffff00',
                            fillOpacity: 0.4
                        });
                    }
                }).addTo(map);

                // Agregar efecto de pulso para puntos
                if (targetFeatures.length > 0 && targetFeatures[0].geometry.type === 'Point') {
                    // Crear efecto de pulso
                    let pulseCount = 0;
                    const pulseInterval = setInterval(() => {
                        if (highlightLayer && pulseCount < 6) {
                            highlightLayer.eachLayer(layer => {
                                if (layer.setRadius) {
                                    const currentRadius = layer.getRadius();
                                    layer.setRadius(currentRadius === 12 ? 16 : 12);
                                }
                            });
                            pulseCount++;
                        } else {
                            clearInterval(pulseInterval);
                        }
                    }, 300);
                }

                // Navegar con animación suave
                map.fitBounds(bounds, {
                    padding: [20, 20],
                    maxZoom: targetFeatures.length === 1 ? 15 : 13,
                    animate: true,
                    duration: 0.8
                });

                // Mostrar popup informativo
                setTimeout(() => {
                    if (targetFeatures.length === 1) {
                        showAlert(`📍 Navegando a: ${featureId}`, 'info', 2000);
                    } else {
                        showAlert(`📍 Navegando a ${targetFeatures.length} puntos de: ${featureId}`, 'info', 2000);
                    }
                }, 500);

                // Auto-remover highlight después de 8 segundos
                setTimeout(() => {
                    if (highlightLayer) {
                        map.removeLayer(highlightLayer);
                        highlightLayer = null;
                    }
                }, 8000);
            }
        }

        /**
         * Crea una sección colapsible para mostrar elementos de una capa
         */
        function createLayerSection(title, features, propertyName, color = '#008000', isLenguasLayer = false, layerName = '') {
            const section = document.createElement('div');
            section.className = 'layer-section';

            const header = document.createElement('h6');

            const content = document.createElement('div');
            content.className = 'layer-content';

            if (features.length === 0) {
                header.innerHTML = `${title} <span class="badge bg-secondary">0</span>`;
                content.innerHTML = '<p class="text-muted small mb-0">No se encontraron elementos.</p>';
            } else {
                const ul = document.createElement('ul');

                if (isLenguasLayer) {
                    // Para lenguas indígenas, mostrar solo valores únicos con conteo
                    const lenguasCount = new Map();

                    features.forEach(f => {
                        if (f.properties[propertyName]) {
                            const lengua = f.properties[propertyName];
                            lenguasCount.set(lengua, (lenguasCount.get(lengua) || 0) + 1);
                        }
                    });

                    // Ordenar alfabéticamente
                    const sortedLenguas = Array.from(lenguasCount.entries()).sort((a, b) => a[0].localeCompare(b[0]));

                    header.innerHTML = `${title} <span class="badge bg-secondary">${sortedLenguas.length} únicas</span>`;

                    sortedLenguas.forEach(([lengua, count]) => {
                        const li = document.createElement('li');
                        li.innerHTML = `<span class="color-dot" style="background:${color}"></span>${lengua} <span class="badge bg-light text-dark ms-1">${count}</span>`;
                        li.dataset.featureId = lengua;
                        li.dataset.layerName = layerName;
                        li.setAttribute('role', 'button');
                        li.setAttribute('tabindex', '0');
                        li.setAttribute('aria-label', `Lengua ${lengua} con ${count} puntos - Clic para navegar`);

                        // Agregar evento de navegación
                        li.addEventListener('click', () => {
                            navigateToFeature(lengua, layerName, features, propertyName);
                            li.classList.add('active');
                            // Remover active de otros elementos
                            ul.querySelectorAll('li').forEach(otherLi => {
                                if (otherLi !== li) otherLi.classList.remove('active');
                            });
                        });

                        // Soporte para teclado
                        li.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                li.click();
                            }
                        });

                        ul.appendChild(li);
                    });
                } else {
                    // Para otras capas, mostrar todos los elementos
                    header.innerHTML = `${title} <span class="badge bg-secondary">${features.length}</span>`;

                    features.forEach((f, index) => {
                        if (f.properties[propertyName]) {
                            const li = document.createElement('li');
                            li.innerHTML = `<span class="color-dot" style="background:${color}"></span>${f.properties[propertyName]}`;
                            li.dataset.featureId = f.properties[propertyName];
                            li.dataset.layerName = layerName;
                            li.setAttribute('role', 'button');
                            li.setAttribute('tabindex', '0');
                            li.setAttribute('aria-label', `${f.properties[propertyName]} - Clic para navegar`);

                            // Agregar evento de navegación
                            li.addEventListener('click', () => {
                                navigateToFeature(f.properties[propertyName], layerName, features, propertyName);
                                li.classList.add('active');
                                // Remover active de otros elementos
                                ul.querySelectorAll('li').forEach(otherLi => {
                                    if (otherLi !== li) otherLi.classList.remove('active');
                                });
                            });

                            // Soporte para teclado
                            li.addEventListener('keydown', (e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    li.click();
                                }
                            });

                            ul.appendChild(li);
                        }
                    });
                }

                content.appendChild(ul);
            }

            // Toggle functionality
            header.addEventListener('click', () => {
                section.classList.toggle('collapsed');
            });

            section.appendChild(header);
            section.appendChild(content);

            return section;
        }

        /**
         * Actualiza la visualización de todas las capas encontradas
         */
        function updateLayersDisplay(layersData) {
            layersContainer.innerHTML = '';

            let totalElements = 0;

            // Definir colores para cada capa
            const layerColors = {
                localidades: '#008000',
                atlas: '#ff00ff',
                municipios: '#0000ff',
                regiones: '#ffa500',
                ran: '#ff0000',
                lenguas: '#00ffff'
            };

            // Crear secciones para cada capa
            Object.entries(layersData).forEach(([layerName, data]) => {
                if (data.features && data.features.length > 0) {
                    const propertyMap = {
                        localidades: 'CVEGEO',
                        atlas: 'CVEGEO',
                        municipios: 'CVEGEO',
                        regiones: 'Name',
                        ran: 'Clv_Unica',
                        lenguas: 'Lengua'
                    };

                    const titleMap = {
                        localidades: 'Localidades',
                        atlas: 'Atlas Pueblos Indígenas',
                        municipios: 'Municipios',
                        regiones: 'Regiones Indígenas',
                        ran: 'RAN',
                        lenguas: 'Lenguas Indígenas'
                    };

                    // Determinar si es la capa de lenguas para tratamiento especial
                    const isLenguasLayer = layerName === 'lenguas';

                    const section = createLayerSection(
                        titleMap[layerName],
                        data.features,
                        propertyMap[layerName],
                        layerColors[layerName],
                        isLenguasLayer,
                        layerName
                    );

                    layersContainer.appendChild(section);

                    // Para lenguas, contar solo las únicas para el total
                    if (isLenguasLayer) {
                        const uniqueLenguas = new Set();
                        data.features.forEach(f => {
                            if (f.properties[propertyMap[layerName]]) {
                                uniqueLenguas.add(f.properties[propertyMap[layerName]]);
                            }
                        });
                        totalElements += uniqueLenguas.size;
                    } else {
                        totalElements += data.features.length;
                    }
                }
            });

            // Actualizar contadores
            const badge = document.getElementById('foundCountBadge');
            if (badge) badge.textContent = formatNumber(totalElements);
            const totalFound = document.getElementById('totalFound');
            if (totalFound) totalFound.textContent = formatNumber(totalElements);
            const currentCriteria = document.getElementById('currentCriteria');
            if (currentCriteria) {
                currentCriteria.textContent = areaTypeSelect.options[areaTypeSelect.selectedIndex].text;
            }

            if (totalElements === 0) {
                layersContainer.innerHTML = '<p class="mb-0 text-muted">No se encontraron elementos en ninguna capa.</p>';
            }
        }

        /**
         * Limpia todas las capas del mapa y resetea el estado de la aplicación
         */
        function clearAllLayers() {
            // Remover todas las capas del mapa
            [kmlLayer, bufferLayer, clippedLocalitiesLayer, clippedAtlasLayer, clippedMunicipiosLayer, clippedRegionesLayer, clippedRanLayer, clippedLenguasLayer, highlightLayer]
                .forEach(layer => { if (layer) map.removeLayer(layer); });

            // Resetear variables de estado
            kmlLayer = bufferLayer = clippedLocalitiesLayer = clippedAtlasLayer = clippedMunicipiosLayer = clippedRegionesLayer = clippedRanLayer = clippedLenguasLayer = highlightLayer = null;
            kmlGeoJson = null;
            lastAreaBounds = null;

            // Resetear UI a estado inicial
            layersContainer.innerHTML = '<p class="mb-0 text-muted">Sube un KML y realiza el recorte para ver las capas.</p>';
            uploadKmlBtn.disabled = true;
            performClipBtn.disabled = true;
            if (centerKmlBtn) centerKmlBtn.disabled = true;
            if (resetViewBtn) resetViewBtn.disabled = true;

            // Limpiar el input del archivo KML
            if (kmlFileInput) {
                kmlFileInput.value = '';
            }

            // Resetear contadores y badges
            const badge = document.getElementById('foundCountBadge');
            if (badge) badge.textContent = formatNumber(0);
            const totalFound = document.getElementById('totalFound');
            if (totalFound) totalFound.textContent = formatNumber(0);
            const currentCriteria = document.getElementById('currentCriteria');
            if (currentCriteria) currentCriteria.textContent = '—';

            // Recrear control de capas
            if (overlaysControl) {
                map.removeControl(overlaysControl);
            }
            overlaysControl = L.control.layers(null, null, { collapsed: false }).addTo(map);
        }

        // ====================================================================
        // PROCESAMIENTO DE ARCHIVOS KML
        // ====================================================================

        /**
         * Valida que el archivo seleccionado sea un KML válido
         */
        function validateKmlFile(file) {
            const validExtensions = ['.kml', '.kmz'];
            const fileName = file.name.toLowerCase();
            const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));

            if (!hasValidExtension) {
                showAlert('Por favor, selecciona un archivo con extensión .kml o .kmz', 'warning');
                return false;
            }

            const maxSize = 10 * 1024 * 1024; // 10MB en bytes
            if (file.size > maxSize) {
                showAlert('El archivo es demasiado grande. El tamaño máximo permitido es 10MB.', 'warning');
                return false;
            }

            return true;
        }

        /**
         * Procesa un archivo KML cargado por el usuario
         */
        function processKmlFile(file) {
            if (!validateKmlFile(file)) {
                return;
            }

            const reader = new FileReader();

            reader.onload = function (e) {
                try {
                    const kmlText = e.target.result;

                    if (!kmlText || kmlText.trim().length === 0) {
                        showAlert('El archivo KML está vacío o no se pudo leer correctamente.', 'danger');
                        return;
                    }

                    const kmlDom = new DOMParser().parseFromString(kmlText, 'text/xml');

                    const parseError = kmlDom.querySelector('parsererror');
                    if (parseError) {
                        showAlert('El archivo KML contiene errores de formato XML. Verifica que sea un archivo válido.', 'danger');
                        return;
                    }

                    kmlGeoJson = toGeoJSON.kml(kmlDom);

                    if (!kmlGeoJson || !kmlGeoJson.features || kmlGeoJson.features.length === 0) {
                        showAlert('El archivo KML no contiene geometrías válidas o no se pudo convertir.', 'warning');
                        performClipBtn.disabled = true;
                        return;
                    }

                    const kmlPolygon = kmlGeoJson.features.find(f =>
                        f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
                    );

                    if (!kmlPolygon) {
                        showAlert(
                            'El archivo KML no contiene un polígono válido. ' +
                            'Por favor, asegúrate de que el archivo contenga geometrías de tipo Polygon o MultiPolygon.',
                            'warning'
                        );
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

                    setTimeout(() => {
                        map.invalidateSize();
                        const b = kmlLayer.getBounds();
                        if (b && b.isValid()) {
                            map.fitBounds(b, { padding: [24, 24], maxZoom: 15, animate: true, duration: 0.5 });
                            lastAreaBounds = b;
                        }
                    }, 50);

                    performClipBtn.disabled = false;
                    if (centerKmlBtn) centerKmlBtn.disabled = false;
                    showAlert(`KML cargado exitosamente. Se encontró un polígono con ${kmlPolygon.geometry.coordinates.length} coordenadas.`, 'success');

                } catch (error) {
                    console.error('Error procesando KML:', error);
                    showAlert(
                        'Error procesando el archivo KML. Verifica que sea un archivo válido y no esté corrupto. ' +
                        'Detalles: ' + error.message,
                        'danger',
                        8000
                    );
                }
            };

            reader.onerror = function () {
                showAlert('Error al leer el archivo. Intenta nuevamente con un archivo diferente.', 'danger');
            };

            reader.readAsText(file);
        }

        // ====================================================================
        // PROCESAMIENTO GEOESPACIAL PRINCIPAL
        // ====================================================================

        /**
         * Función auxiliar para crear popups limpios sin campos N/A
         */
        function createPopupContent(title, icon, fields) {
            let content = `
                <div class="popup-content">
                    <h6 class="popup-title">${icon} ${title}</h6>
                    <div class="popup-info">
            `;

            fields.forEach(field => {
                if (field.value && field.value !== 'N/A' && field.value !== '' && field.value !== null && field.value !== undefined) {
                    if (field.isMain) {
                        content += `<strong>${field.value}</strong><br>`;
                    } else {
                        content += `<small><strong>${field.label}:</strong> ${field.value}</small><br>`;
                    }
                }
            });

            content += `
                    </div>
                </div>
            `;

            return content;
        }

        /**
         * Función auxiliar para recortar una capa específica
         */
        function clipLayer(data, propertyName, styleOptions, popupFormatter, clipArea) {
            const clipGeom = clipArea || kmlGeoJson.features.find(f => f.geometry.type.includes('Polygon'));
            const clipped = data.features.filter(f => turf.booleanIntersects(f.geometry, clipGeom.geometry));
            const layer = L.geoJSON(turf.featureCollection(clipped), styleOptions);

            if (popupFormatter) {
                layer.eachLayer(l => {
                    const props = l.feature.properties;
                    l.bindPopup(popupFormatter(props));
                });
            }

            return { clipped, layer };
        }

        /**
         * FUNCIÓN PRINCIPAL: Realiza el recorte de todas las capas según el área seleccionada
         */
        async function performClipping() {
            try {
                showPreloader();
                updateProgress(0, 'Iniciando análisis geoespacial...');

                // Pequeño delay para asegurar que el preloader se muestre
                await new Promise(resolve => setTimeout(resolve, 100));

                updateProgress(5, 'Validando insumos…');

                if (!kmlGeoJson) {
                    hidePreloader();
                    showModal({
                        title: 'Recorte de Capas',
                        message: 'Primero carga un archivo KML válido para poder realizar el recorte.',
                        okText: 'Entendido'
                    });
                    return;
                }

                // Verificar que al menos algunas capas estén disponibles
                const availableLayers = [
                    { data: localitiesData, name: 'Localidades' },
                    { data: atlasData, name: 'Atlas Pueblos Indígenas' },
                    { data: municipiosData, name: 'Municipios' },
                    { data: regionesData, name: 'Regiones Indígenas' },
                    { data: ranData, name: 'RAN' },
                    { data: lenguasData, name: 'Lenguas Indígenas' }
                ].filter(layer => layer.data && layer.data.features && layer.data.features.length > 0);

                if (availableLayers.length === 0) {
                    hidePreloader();
                    showModal({
                        title: 'Sin datos disponibles',
                        message: 'No hay capas geoespaciales disponibles para realizar el recorte. Esto puede deberse a problemas de conexión durante la carga inicial.',
                        okText: 'Entendido'
                    });
                    return;
                }

                console.log(`Capas disponibles para recorte: ${availableLayers.map(l => l.name).join(', ')}`);
                showAlert(`Procesando ${availableLayers.length} capas disponibles`, 'info', 2000);

                const T = await ensureTurf();
                updateProgress(8, 'Realizando el análisis, por favor espere…');

                const kmlPolygon = kmlGeoJson.features.find(f => f.geometry.type.includes('Polygon'));
                let clipArea = kmlPolygon;

                // Crear buffer para área núcleo si es necesario
                if (areaTypeSelect.value === 'nucleo') {
                    try {
                        updateProgress(15, 'Generando buffer de 500m…');
                        clipArea = turf.buffer(kmlPolygon, 0.5, { units: 'kilometers' });

                        if (bufferLayer) map.removeLayer(bufferLayer);
                        bufferLayer = L.geoJSON(clipArea, {
                            style: { color: '#0078ff', weight: 2, fillColor: '#0078ff', fillOpacity: 0.1 }
                        }).addTo(map);

                        lastAreaBounds = L.geoJSON(clipArea).getBounds();
                    } catch (err) {
                        console.error("Error creando buffer:", err);
                        showAlert("No se pudo crear el buffer de 500m.", 'danger');
                        hidePreloader();
                        return;
                    }
                }

                // Remover capas anteriores
                [clippedLocalitiesLayer, clippedAtlasLayer, clippedMunicipiosLayer, clippedRegionesLayer, clippedRanLayer, clippedLenguasLayer]
                    .forEach(layer => { if (layer) map.removeLayer(layer); });

                // Recrear control de capas
                if (overlaysControl) {
                    map.removeControl(overlaysControl);
                }
                overlaysControl = L.control.layers(null, null, { collapsed: false }).addTo(map);

                // Procesar solo las capas que estén disponibles
                const layersData = {};
                let processedCount = 0;
                const totalLayers = availableLayers.length;

                if (localitiesData && localitiesData.features) {
                    updateProgress(20 + (processedCount * 60 / totalLayers), 'Procesando localidades…');
                    const locResult = clipLayer(localitiesData, "CVEGEO",
                        { pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 6, fillColor: '#008000', color: '#000', weight: 1, opacity: 1, fillOpacity: 0.8 }) },
                        p => createPopupContent('Localidad', '🏘️', [
                            { value: p.NOM_LOC || p.NOMBRE || 'Sin nombre', isMain: true },
                            { label: 'CVEGEO', value: p.CVEGEO },
                            { label: 'Municipio', value: p.NOM_MUN || p.MUNICIPIO },
                            { label: 'Estado', value: p.NOM_ENT || p.ESTADO }
                        ]), clipArea);
                    clippedLocalitiesLayer = locResult.layer.addTo(map);
                    overlaysControl.addOverlay(clippedLocalitiesLayer, "Localidades");
                    layersData.localidades = { features: locResult.clipped };
                    processedCount++;
                }

                if (atlasData && atlasData.features) {
                    updateProgress(20 + (processedCount * 60 / totalLayers), 'Procesando atlas pueblos indígenas…');
                    const atlasResult = clipLayer(atlasData, "CVEGEO",
                        { pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 5, fillColor: '#ff00ff', color: '#000', weight: 1, opacity: 1, fillOpacity: 0.8 }) },
                        p => createPopupContent('Atlas Pueblos Indígenas', '🏛️', [
                            { value: p.CVEGEO, isMain: true },
                            { label: 'Localidad', value: p.NOM_LOC || p.NOMBRE },
                            { label: 'Municipio', value: p.NOM_MUN || p.MUNICIPIO }
                        ]), clipArea);
                    clippedAtlasLayer = atlasResult.layer.addTo(map);
                    overlaysControl.addOverlay(clippedAtlasLayer, "Atlas Pueblos Indígenas");
                    layersData.atlas = { features: atlasResult.clipped };
                    processedCount++;
                }

                if (municipiosData && municipiosData.features) {
                    updateProgress(20 + (processedCount * 60 / totalLayers), 'Procesando municipios…');
                    const munResult = clipLayer(municipiosData, "CVEGEO",
                        { style: { color: '#0000ff', weight: 2, fillOpacity: 0.1 } },
                        p => createPopupContent('Municipio', '🏛️', [
                            { value: p.NOM_MUN || p.NOMBRE || p.MUNICIPIO || 'Sin nombre', isMain: true },
                            { label: 'CVEGEO', value: p.CVEGEO },
                            { label: 'Estado', value: p.NOM_ENT || p.ESTADO },
                            { label: 'Cabecera', value: p.NOM_CAB || p.CABECERA }
                        ]), clipArea);
                    clippedMunicipiosLayer = munResult.layer.addTo(map);
                    overlaysControl.addOverlay(clippedMunicipiosLayer, "Municipios");
                    layersData.municipios = { features: munResult.clipped };
                    processedCount++;
                }

                if (regionesData && regionesData.features) {
                    updateProgress(20 + (processedCount * 60 / totalLayers), 'Procesando regiones indígenas…');
                    const regResult = clipLayer(regionesData, "Name",
                        { style: { color: '#ffa500', weight: 2, fillOpacity: 0.1 } },
                        p => createPopupContent('Región Indígena', '🌄', [
                            { value: p.Name || p.NOMBRE || 'Sin nombre', isMain: true },
                            { label: 'Tipo', value: p.Tipo || p.TIPO },
                            { label: 'Descripción', value: p.Descripci || p.DESCRIPCION }
                        ]), clipArea);
                    clippedRegionesLayer = regResult.layer.addTo(map);
                    overlaysControl.addOverlay(clippedRegionesLayer, "Regiones Indígenas");
                    layersData.regiones = { features: regResult.clipped };
                    processedCount++;
                }

                if (ranData && ranData.features) {
                    updateProgress(20 + (processedCount * 60 / totalLayers), 'Procesando RAN…');
                    const ranResult = clipLayer(ranData, "Clv_Unica",
                        { style: { color: '#ff0000', weight: 2, fillOpacity: 0.1 } },
                        p => createPopupContent('RAN', '🌾', [
                            { value: p.Clv_Unica, isMain: true },
                            { label: 'Nombre', value: p.Nombre || p.NOMBRE },
                            { label: 'Tipo', value: p.Tipo || p.TIPO },
                            { label: 'Estado', value: p.Estado || p.ESTADO },
                            { label: 'Municipio', value: p.Municipio || p.MUNICIPIO }
                        ]), clipArea);
                    clippedRanLayer = ranResult.layer.addTo(map);
                    overlaysControl.addOverlay(clippedRanLayer, "RAN");
                    layersData.ran = { features: ranResult.clipped };
                    processedCount++;
                }

                if (lenguasData && lenguasData.features) {
                    updateProgress(20 + (processedCount * 60 / totalLayers), 'Procesando lenguas indígenas…');
                    const lenguasResult = clipLayer(lenguasData, "Lengua",
                        { pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 5, fillColor: '#00ffff', color: '#000', weight: 1, opacity: 1, fillOpacity: 0.8 }) },
                        p => createPopupContent('Lengua Indígena', '🗣️', [
                            { value: p.Lengua || p.LENGUA || 'Sin especificar', isMain: true },
                            { label: 'Localidad', value: p.NOM_LOC || p.LOCALIDAD },
                            { label: 'Municipio', value: p.NOM_MUN || p.MUNICIPIO },
                            { label: 'Estado', value: p.NOM_ENT || p.ESTADO }
                        ]), clipArea);
                    clippedLenguasLayer = lenguasResult.layer.addTo(map);
                    overlaysControl.addOverlay(clippedLenguasLayer, "Lenguas Indígenas");
                    layersData.lenguas = { features: lenguasResult.clipped };
                    processedCount++;
                }

                updateLayersDisplay(layersData);

                // Ajustar vista del mapa
                const bounds = clipArea ? L.geoJSON(clipArea).getBounds() : kmlLayer.getBounds();
                if (bounds && bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
                    lastAreaBounds = bounds;
                }

                if (resetViewBtn) resetViewBtn.disabled = false;

                updateProgress(100, 'Análisis completado exitosamente');

                // Mantener el preloader visible un poco más para que el usuario vea el progreso completo
                setTimeout(() => {
                    hidePreloader();
                    showAlert('Recorte completado exitosamente. Se han procesado todas las capas.', 'success');
                }, 1200);

            } catch (error) {
                console.error('Error en el recorte:', error);
                showAlert('Error durante el procesamiento. Verifica los datos y vuelve a intentar.', 'danger', 6000);
                hidePreloader();
            }
        }

        // ====================================================================
        // EVENTOS Y ENLACES
        // ====================================================================

        // Habilitar botón de subida cuando se selecciona archivo
        kmlFileInput.addEventListener('change', () => {
            uploadKmlBtn.disabled = kmlFileInput.files.length === 0;
        });

        // Procesar archivo KML
        uploadKmlBtn.addEventListener('click', () => {
            if (kmlFileInput.files[0]) {
                processKmlFile(kmlFileInput.files[0]);
            }
        });

        // Realizar recorte
        performClipBtn.addEventListener('click', performClipping);

        // Limpiar mapa
        clearMapBtn.addEventListener('click', clearAllLayers);

        // Centrar en KML
        if (centerKmlBtn) {
            centerKmlBtn.addEventListener('click', () => {
                if (kmlLayer) {
                    const bounds = kmlLayer.getBounds();
                    if (bounds && bounds.isValid()) {
                        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15, animate: true, duration: 0.6 });
                    }
                }
            });
        }

        // Restaurar vista del área
        if (resetViewBtn) {
            resetViewBtn.addEventListener('click', () => {
                if (lastAreaBounds && lastAreaBounds.isValid()) {
                    map.fitBounds(lastAreaBounds, { padding: [24, 24], maxZoom: 15, animate: true, duration: 0.6 });
                }
            });
        }

        // Recargar datos desde servidor
        if (reloadDataBtn) {
            reloadDataBtn.addEventListener('click', () => {
                // Limpiar datos actuales
                localitiesData = null;
                atlasData = null;
                municipiosData = null;
                regionesData = null;
                ranData = null;
                lenguasData = null;

                // Reintentar carga
                showAlert('Reintentando carga de datos...', 'info', 3000);
                loadDataOptional();
            });
        }

    } catch (error) {
        console.error('Error inicializando aplicación:', error);
        showAlert('Error al inicializar la aplicación. Recarga la página.', 'danger', 8000);
    }
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}