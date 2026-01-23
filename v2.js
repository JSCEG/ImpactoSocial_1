/**
 * GEOVISUALIZADOR DE ÁREAS DE INTERÉS - VERSIÓN V2 (MULTICAPA)
 * ========================================================
 *
 * Esta herramienta ayuda a las personas a ver en un mapa qué localidades
 * (pueblos y ciudades) están dentro de una zona que eligen.
 * Pueden subir un archivo de zona y ver qué localidades se cruzan con esa zona.
 */

// ============================================================================
// VARIABLES DE ESTADO GLOBAL
// ============================================================================

/**
 * Variables principales para manejo del estado de la aplicación
 */
let map; // Instancia principal del mapa Leaflet
let localitiesData = null; // Datos de localidades cargados desde el servidor (polígonos)
let localitiesPointsData = null; // Datos de localidades puntos (coordenadas sin polígono)
let kmlLayer = null; // Capa del polígono KML original cargado por el usuario
let bufferLayer = null; // Capa del buffer generado para área núcleo
let clippedLocalitiesLayer = null; // Capa de localidades resultantes del recorte
let clippedPointsLayer = null; // Capa de localidades puntos resultantes del recorte
let kmlGeoJson = null; // Datos GeoJSON convertidos del KML original
let labelLayer = null; // Capa de etiquetas CVEGEO sobre el mapa
let lastAreaBounds = null; // Bounds del área para restaurar la vista del área
let highlightedLayer = null; // Para el efecto de resaltado

// Variables para el reporte Excel
let totalElements = 0;              // Total de elementos encontrados
let layersData = {};                // Datos de todas las capas para el reporte
let otherLayersData = {};           // Cache de datos de otras capas

// Métricas del KML para reportes
let kmlMetrics = {
    area: 0, // en km²
    perimeter: 0, // en km
    hasOverlaps: false, // si tiene superposiciones
    overlapCount: 0, // número de superposiciones detectadas
    polygonCount: 0, // número de polígonos en el KML
    geometryType: 'N/A',
    bufferUsed: false,
    bufferRadius: 0,
    localityDensity: 0, // localidades por km²
    populationDensity: 0, // población por km²
    totalPopulation: 0, // población total intersectada
};

// ============================================================================
// UTILIDAD DE FORMATEO NUMÉRICO
// ============================================================================
/**
 * Formatea números con separador de miles (locale es-MX)
 * @param {number} n
 * @returns {string}
 */
function formatNumber(n) {
    if (n == null || isNaN(n)) return '0';
    try { return n.toLocaleString('es-MX'); } catch (_) { return String(n); }
}

// ============================================================================
// UTILIDADES PARA CARGA DE DEPENDENCIAS
// ============================================================================

/**
 * Carga dinámicamente un script JavaScript de forma asíncrona
 * @param {string} url - URL del script a cargar
 * @returns {Promise} - Promesa que se resuelve cuando el script se carga exitosamente
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
 * Turf.js es fundamental para las operaciones geoespaciales (intersecciones, buffers, etc.)
 * @returns {Promise<object>} - Objeto Turf.js disponible globalmente
 */
async function ensureTurf() {
    // Si ya existe, úsalo
    if (window.turf) return window.turf;

    // Lista de CDNs alternativos en caso de falla
    const cdns = [
        'https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js',
        'https://unpkg.com/@turf/turf@6/turf.min.js'
    ];

    // Intentar cargar desde cada CDN hasta encontrar uno funcional
    for (const url of cdns) {
        try {
            await loadScript(url);
            if (window.turf) return window.turf;
        } catch (_) {
            /* Continuar con el siguiente CDN */
        }
    }
    throw new Error('Turf no disponible desde ningún CDN');
}

// ============================================================================
// SISTEMA DE ALERTAS Y FEEDBACK VISUAL
// ============================================================================

/**
 * Muestra alertas Bootstrap de forma centralizada con auto-dismiss
 * @param {string} message - Mensaje a mostrar al usuario
 * @param {string} type - Tipo de alerta ('primary', 'success', 'danger', 'warning', 'info')
 * @param {number} timeoutMs - Tiempo en ms antes de auto-ocultar (0 = no auto-ocultar)
 * @returns {HTMLElement} - Elemento de alerta creado
 */
function showAlert(message, type = 'info', timeoutMs = 4000) {
    const container = document.getElementById('toastContainer');
    if (!container) {
        // Fallback si no existe el contenedor
        alert(message);
        return;
    }

    // Crear elemento toast personalizado con estilo Tailwind
    const toast = document.createElement('div');
    const colors = {
        success: 'tw-bg-green-500',
        danger: 'tw-bg-red-500',
        warning: 'tw-bg-yellow-500',
        info: 'tw-bg-blue-500',
        primary: 'tw-bg-primary'
    };
    const icon = {
        success: 'check_circle',
        danger: 'error',
        warning: 'warning',
        info: 'info',
        primary: 'notifications'
    };

    toast.className = `tw-fixed tw-top-4 tw-right-4 tw-z-[9999] tw-flex tw-items-center tw-w-full tw-max-w-xs tw-p-4 tw-text-white tw-bg-white tw-rounded-xl tw-shadow-2xl tw-transform tw-transition-all tw-duration-300 tw-translate-y-[-100%] tw-opacity-0`;
    toast.innerHTML = `
        <div class="tw-inline-flex tw-items-center tw-justify-center tw-flex-shrink-0 tw-w-8 tw-h-8 ${colors[type] || colors.info} tw-rounded-lg">
            <span class="material-symbols-outlined tw-text-white tw-text-lg">${icon[type] || 'info'}</span>
        </div>
        <div class="tw-ml-3 tw-text-sm tw-font-medium tw-text-gray-800">${message}</div>
        <button type="button" class="tw-ml-auto -tw-mx-1.5 -tw-my-1.5 tw-bg-white tw-text-gray-400 hover:tw-text-gray-900 tw-rounded-lg tw-focus:ring-2 tw-focus:ring-gray-300 tw-p-1.5 hover:tw-bg-gray-100 tw-inline-flex tw-items-center tw-justify-center tw-h-8 tw-w-8" aria-label="Close">
            <span class="material-symbols-outlined tw-text-lg">close</span>
        </button>
    `;

    container.appendChild(toast);

    // Animar entrada
    requestAnimationFrame(() => {
        toast.classList.remove('tw-translate-y-[-100%]', 'tw-opacity-0');
    });

    // Configurar cierre
    const closeBtn = toast.querySelector('button');
    closeBtn.onclick = () => {
        toast.classList.add('tw-opacity-0', 'tw-translate-x-full');
        setTimeout(() => toast.remove(), 300);
    };

    // Auto-dismiss
    if (timeoutMs > 0) {
        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.add('tw-opacity-0', 'tw-translate-x-full');
                setTimeout(() => toast.remove(), 300);
            }
        }, timeoutMs);
    }

    return toast;
}

// Utilidad: mostrar modal Bootstrap reutilizable (adaptado a estilo propio si no hay Bootstrap)
function showModal({ title = 'Aviso', message = '', okText = 'Aceptar', onOk = null } = {}) {
    // Implementación simple usando alert/confirm si no hay modal complejo,
    // o integrarse con el modal de resultados si se desea.
    // Por ahora usaremos un alert simple para mensajes rápidos o el modal de Bootstrap si existe.
    if (typeof bootstrap !== 'undefined') {
        // Usar modal de bootstrap si existe estructura
        // ... (código existente de modal bootstrap)
    } 
    // Fallback a alert nativo para simplicidad en este entorno, o crear un modal dinámico
    alert(`${title}\n\n${message.replace(/<[^>]*>/g, '')}`);
    if (onOk) onOk();
}

// Confirmación con modal. Devuelve una Promesa<boolean>.
function showConfirm({ title = 'Confirmar', message = '', okText = 'Aceptar', cancelText = 'Cancelar' } = {}) {
    return new Promise((resolve) => {
        const result = confirm(`${title}\n\n${message.replace(/<[^>]*>/g, '')}`);
        resolve(result);
    });
}

/**
 * Oculta el preloader de forma robusta con transición suave
 * El preloader se muestra durante operaciones largas como el recorte de localidades
 */
function hidePreloader() {
    const pre = document.getElementById('preloader');
    if (!pre) return;

    // Marcar como hidden y ocultar visualmente
    pre.classList.remove('active');
    
    // Tras la transición CSS, eliminarlo del flujo de documentos
    setTimeout(() => {
        // Recalcular tamaño del mapa después de cambios de layout
        if (typeof map !== 'undefined' && map) {
            setTimeout(() => map.invalidateSize(), 100);
        }
    }, 400);
}

/**
 * Muestra el preloader durante operaciones largas
 * Crea el overlay dinámicamente si no existe
 */
function showPreloader() {
    let pre = document.getElementById('preloader');
    if (pre) {
        pre.classList.add('active');
    }
}

/**
 * Actualiza la barra de progreso y mensaje del preloader
 * @param {number} percent - Porcentaje de progreso (0-100)
 * @param {string} message - Mensaje descriptivo del progreso actual
 */
function updateProgress(percent, message) {
    const bar = document.getElementById('preloaderBar');
    const msg = document.getElementById('preloaderStatus');

    if (bar) {
        const clampedPercent = Math.max(0, Math.min(100, percent));
        bar.style.width = `${clampedPercent}%`;
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
 * Esta función se ejecuta cuando el DOM está listo
 */
function initApp() {
    try {
        const MAP_CONTAINER_ID = 'map';
        // Garantizar que el preloader no bloquee la vista inicial
        hidePreloader();

        // ====================================================================
        // CONFIGURACIÓN DEL MAPA BASE CON MAPTILER
        // ====================================================================

        const initialView = {
            center: [24.1, -102],
            zoom: 5
        };

        // MapTiler API Keys
        const mapTilerKeys = {
            personal: 'jAAFQsMBZ9a6VIm2dCwg',
            amigo: 'xRR3xCujdkUjxkDqlNTG'
        };

        // Verificar disponibilidad de MapTiler SDK
        function checkMapTilerSDK() {
            if (typeof L.maptiler !== 'undefined' && L.maptiler.maptilerLayer) {
                console.log('MapTiler SDK disponible');
                return true;
            } else {
                console.warn('MapTiler SDK no disponible');
                return false;
            }
        }

        // Función para crear MapTiler layer usando SDK o fallback con API key específica
        function createMapTilerLayer(styleId, apiKeyType, fallbackUrl, attribution, name) {
            const apiKey = mapTilerKeys[apiKeyType];

            if (checkMapTilerSDK()) {
                try {
                    // Usar el SDK de MapTiler (método recomendado)
                    const layer = L.maptiler.maptilerLayer({
                        apiKey: apiKey,
                        style: styleId,
                        maxZoom: 18 // Asegurar maxZoom para clusters
                    });

                    // Configurar maxZoom manualmente si no está definido
                    if (!layer.options) layer.options = {};
                    if (!layer.options.maxZoom) layer.options.maxZoom = 18;

                    console.log(`${name} creado con MapTiler SDK usando key ${apiKeyType}`);
                    return layer;
                } catch (error) {
                    console.warn(`Error creando ${name} con SDK:`, error);
                }
            }

            // Fallback a tile layer estándar
            console.log(`${name} usando fallback`);
            return L.tileLayer(fallbackUrl, {
                attribution: attribution,
                maxZoom: 18
            });
        }

        // Tu mapa personalizado de MapTiler
        const MiMapaPersonalizado = createMapTilerLayer(
            '0198a42c-5e08-77a1-9773-763ee4e12b32', // Tu style ID
            'personal', // Usar tu API key
            'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
            '&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            'Mi Mapa Personalizado'
        );

        // Mapas originales 
        const SenerLightOriginal = createMapTilerLayer(
            '0198a9af-dc7c-79d3-8316-a80767ad1d0f',
            'amigo',
            'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
            '&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            'SENER Light Original'
        );

        const SenerDarkOriginal = createMapTilerLayer(
            '0198a9f0-f135-7991-aaec-bea71681556e',
            'amigo',
            'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            '&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            'SENER Dark Original'
        );

        // Google Satellite Layer (fallback)
        const GoogleSatellite = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
            attribution: '&copy; Google',
            maxZoom: 20
        });

        const baseMaps = {
            'SENER Azul': MiMapaPersonalizado,
            'SENER Light': SenerLightOriginal,
            'SENER Oscuro': SenerDarkOriginal,
            'Google Satellite': GoogleSatellite
        };

        // Definir límites aproximados de México para restringir navegación
        const mexicoBounds = L.latLngBounds([
            [14.0, -118.0], // Suroeste (aprox. Chiapas / Pacífico)
            [33.5, -86.0]   // Noreste (frontera norte / Golfo)
        ]);

        map = L.map(MAP_CONTAINER_ID, {
            center: initialView.center,
            zoom: initialView.zoom,
            minZoom: 4,
            maxZoom: 18,
            maxBounds: mexicoBounds,
            maxBoundsViscosity: 0.9,
            layers: [baseMaps['SENER Light']]
        });

        map.on('click', function (e) {
            // Si el clic no fue en una capa, limpiar el resaltado
            if (e.originalEvent.target.classList.contains('leaflet-container')) {
                clearHighlight();
            }
        });

        // Evitar hacer zoom out más allá del marco continental relevante
        map.on('zoomend', () => {
            if (map.getZoom() < 4) map.setZoom(4);
        });

        // Ajustar vista para asegurar bounds al iniciar (si se desea ver todo México)
        map.fitBounds(mexicoBounds.pad(-0.15));

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

        L.control.layers(baseMaps, {}, { collapsed: false }).addTo(map);

        // ====================================================================
        // CONFIGURACIÓN DE DATOS Y ELEMENTOS DEL DOM
        // ====================================================================

        // URLs de servicios de localidades (datos geoespaciales de INEGI)
        const localitiesUrl = 'https://cdn.sassoapps.com/Gabvy/localidades_4326.geojson';
        const localitiesPointsUrl = 'https://cdn.sassoapps.com/Gabvy/localidades_puntos.geojson'; // Puntos

        // URLs de otras capas
        const otherLayersUrls = {
            atlas: 'https://cdn.sassoapps.com/Gabvy/atlas_pueblos_indigenas.geojson',
            regiones: 'https://cdn.sassoapps.com/Gabvy/regiones_indigenas.geojson',
            lenguas: 'https://cdn.sassoapps.com/Gabvy/lenguas_indigenas.geojson',
            loc_ind: 'https://cdn.sassoapps.com/Gabvy/localidades_indigenas.geojson',
            ruta: 'https://cdn.sassoapps.com/Gabvy/ruta_wixarika.geojson',
            ran: 'https://cdn.sassoapps.com/Gabvy/nucleos_agrarios_ran.geojson',
            anp_estatal: 'https://cdn.sassoapps.com/Gabvy/anp_estatal.geojson',
            ramsar: 'https://cdn.sassoapps.com/Gabvy/sitios_ramsar.geojson',
            za_publico: 'https://cdn.sassoapps.com/Gabvy/zonas_arqueologicas_publico.geojson',
            sitio_arqueologico: 'https://cdn.sassoapps.com/Gabvy/sitios_arqueologicos.geojson',
            z_historicos: 'https://cdn.sassoapps.com/Gabvy/zonas_monumentos_historicos.geojson',
            municipios: 'https://cdn.sassoapps.com/Gabvy/municipios.geojson'
        };

        // Referencias a elementos del DOM para controles
        const kmlFileInput = document.getElementById('kmlFile');
        const uploadKmlBtn = document.getElementById('uploadKmlBtn');
        const clipTypeSelect = document.getElementById('clipTypeSelect');
        const customBufferContainer = document.getElementById('customBufferContainer');
        const customBufferInput = document.getElementById('customBufferInput');
        const performClipBtn = document.getElementById('uploadKmlBtn'); // Reutilizado como botón de acción
        const clearMapBtn = document.getElementById('clearMap');

        // Mapa para mantener referencias de features por CVEGEO (para navegación)
        let featureLayersById = new Map(); // ID -> {bounds|latlng, layer}

        // Mostrar/ocultar input de buffer según el tipo
        if (clipTypeSelect && customBufferContainer) {
            const syncBufferVisibility = () => {
                if (clipTypeSelect.value === 'custom') {
                    customBufferContainer.classList.remove('tw-hidden');
                } else {
                    customBufferContainer.classList.add('tw-hidden');
                }
            };
            syncBufferVisibility();
            clipTypeSelect.addEventListener('change', syncBufferVisibility);
        }

        // ====================================================================
        // FUNCIONES DE MANEJO DE DATOS GEOESPACIALES
        // ====================================================================

        /**
         * Carga los datos de localidades desde el servidor de forma asíncrona
         */
        async function loadLocalitiesData() {
            try {
                // Cargar polígonos de localidades
                const response = await fetch(localitiesUrl);
                if (!response.ok) throw new Error(`Error HTTP! status: ${response.status}`);
                localitiesData = await response.json();
                console.log(`Localidades polígonos cargadas: ${localitiesData.features.length}`);

                // Cargar puntos de localidades
                const pointsResponse = await fetch(localitiesPointsUrl);
                if (!pointsResponse.ok) throw new Error(`Error HTTP puntos! status: ${pointsResponse.status}`);
                localitiesPointsData = await pointsResponse.json();
                console.log(`Localidades puntos cargadas: ${localitiesPointsData.features.length}`);

            } catch (error) {
                console.error('Error al cargar localidades:', error);
                showAlert('Error al cargar localidades desde el servidor. Verifica tu conexión.', 'danger', 6000);
                throw error;
            }
        }

        /**
         * Carga datos de una capa específica con caché simple
         */
        async function loadLayerData(layerKey) {
            if (otherLayersData[layerKey]) return otherLayersData[layerKey];
            
            const url = otherLayersUrls[layerKey];
            if (!url) return null;

            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Error HTTP ${layerKey}: ${response.status}`);
                const data = await response.json();
                otherLayersData[layerKey] = data;
                return data;
            } catch (error) {
                console.warn(`Error cargando capa ${layerKey}:`, error);
                return null;
            }
        }

        /**
         * Limpia todas las capas del mapa y resetea el estado de la aplicación
         */
        function clearAllLayers() {
            // Remover todas las capas del mapa
            if (kmlLayer) map.removeLayer(kmlLayer);
            if (bufferLayer) map.removeLayer(bufferLayer);
            if (clippedLocalitiesLayer) map.removeLayer(clippedLocalitiesLayer);
            if (clippedPointsLayer) map.removeLayer(clippedPointsLayer);
            if (labelLayer) map.removeLayer(labelLayer);
            
            // Remover capas adicionales del mapa
            map.eachLayer((layer) => {
                if (layer.options && layer.options.isResultLayer) {
                    map.removeLayer(layer);
                }
            });

            // Limpiar la capa resaltada
            clearHighlight();

            // Resetear variables de estado
            kmlLayer = null;
            bufferLayer = null;
            clippedLocalitiesLayer = null;
            clippedPointsLayer = null;
            labelLayer = null;
            kmlGeoJson = null;
            lastAreaBounds = null;
            layersData = {};

            // Resetear UI
            uploadKmlBtn.disabled = true;
            document.getElementById('fileNameLabel').textContent = 'SELECCIONAR ARCHIVO';
            
            // Ocultar resultados flotantes
            document.getElementById('floatingResultsBtn').classList.add('tw-hidden');
            document.getElementById('resultsBadgeCount').textContent = '0';
        }

        // ====================================================================
        // FUNCIONES DE NAVEGACIÓN Y VISUALIZACIÓN
        // ====================================================================

        function clearHighlight() {
            if (highlightedLayer) {
                if (typeof highlightedLayer.setStyle === 'function') {
                    highlightedLayer.setStyle(highlightedLayer.options.originalStyle);
                }
                highlightedLayer = null;
            }
        }

        // ====================================================================
        // PROCESAMIENTO DE ARCHIVOS KML
        // ====================================================================

        function validateKmlFile(file) {
            const validExtensions = ['.kml', '.kmz'];
            const fileName = file.name.toLowerCase();
            const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));

            if (!hasValidExtension) {
                showAlert('Por favor, selecciona un archivo con extensión .kml o .kmz', 'warning');
                return false;
            }

            const maxSize = 10 * 1024 * 1024; // 10MB
            if (file.size > maxSize) {
                showAlert('El archivo es demasiado grande. El tamaño máximo permitido es 10MB.', 'warning');
                return false;
            }

            return true;
        }

        function processKmlFile(file) {
            if (!validateKmlFile(file)) return;

            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const kmlText = e.target.result;
                    if (!kmlText || kmlText.trim().length === 0) {
                        showAlert('El archivo KML está vacío.', 'danger');
                        return;
                    }

                    const kmlDom = new DOMParser().parseFromString(kmlText, 'text/xml');
                    const parseError = kmlDom.querySelector('parsererror');
                    if (parseError) {
                        showAlert('El archivo KML contiene errores de formato XML.', 'danger');
                        return;
                    }

                    kmlGeoJson = toGeoJSON.kml(kmlDom);

                    if (!kmlGeoJson || !kmlGeoJson.features || kmlGeoJson.features.length === 0) {
                        showAlert('El archivo KML no contiene geometrías válidas.', 'warning');
                        return;
                    }

                    const polygons = kmlGeoJson.features.filter(f =>
                        f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
                    );

                    if (polygons.length === 0) {
                        showAlert('El archivo KML no contiene polígonos válidos.', 'warning');
                        return;
                    }

                    // Unificar polígonos
                    const allPolygonCoordinates = [];
                    polygons.forEach(p => {
                        if (p.geometry.type === 'Polygon') {
                            allPolygonCoordinates.push(p.geometry.coordinates);
                        } else if (p.geometry.type === 'MultiPolygon') {
                            p.geometry.coordinates.forEach(polyCoords => {
                                allPolygonCoordinates.push(polyCoords);
                            });
                        }
                    });

                    const kmlPolygonFeature = {
                        type: 'Feature',
                        properties: polygons[0].properties || {},
                        geometry: {
                            type: 'MultiPolygon',
                            coordinates: allPolygonCoordinates
                        }
                    };

                    kmlGeoJson.features = [kmlPolygonFeature];

                    if (kmlLayer) map.removeLayer(kmlLayer);

                    kmlLayer = L.geoJSON(kmlPolygonFeature, {
                        style: { color: '#ff7800', weight: 3, fillColor: '#ffa500', fillOpacity: 0.2 }
                    }).addTo(map);

                    map.fitBounds(kmlLayer.getBounds(), { padding: [50, 50] });
                    lastAreaBounds = kmlLayer.getBounds();

                    uploadKmlBtn.disabled = false;
                    document.getElementById('fileNameLabel').textContent = file.name;
                    showAlert(`KML cargado. Listo para análisis.`, 'success');

                } catch (error) {
                    console.error('Error procesando KML:', error);
                    showAlert('Error procesando el archivo KML.', 'danger');
                }
            };
            reader.readAsText(file);
        }

        // ====================================================================
        // PROCESAMIENTO GEOESPACIAL PRINCIPAL
        // ====================================================================

        async function performClipping() {
            showPreloader();
            updateProgress(3, 'Validando insumos…');

            if (!kmlGeoJson) {
                showAlert('Primero carga un archivo KML válido.', 'warning');
                hidePreloader();
                return;
            }

            try {
                const T = await ensureTurf();
                updateProgress(8, 'Iniciando análisis multicapa…');

                // Cargar localidades si no están
                if (!localitiesData) {
                    await loadLocalitiesData();
                    updateProgress(12, 'Localidades base cargadas…');
                }

                // Limpiar capas previas
                if (bufferLayer) map.removeLayer(bufferLayer);
                map.eachLayer((layer) => {
                    if (layer.options && layer.options.isResultLayer) {
                        map.removeLayer(layer);
                    }
                });
                layersData = {};

                // Definir área de recorte (Buffer)
                const clipType = clipTypeSelect.value;
                const kmlPolygon = kmlGeoJson.features[0];
                let clipArea = kmlPolygon;
                let bufferMeters = 0;

                if (clipType !== 'exact') {
                    if (clipType === 'direct') bufferMeters = 2000;
                    else if (clipType === 'indirect') bufferMeters = 5000;
                    else if (clipType === 'custom') {
                        bufferMeters = parseFloat(customBufferInput.value) * 1000 || 0;
                    }

                    if (bufferMeters > 0) {
                        const buffer = T.buffer(kmlPolygon, bufferMeters, { units: 'meters' });
                        clipArea = buffer;
                        bufferLayer = L.geoJSON(buffer, {
                            style: { color: '#0078ff', weight: 2, fillColor: '#0078ff', fillOpacity: 0.1, dashArray: '5,5' }
                        }).addTo(map);
                    }
                }

                // Identificar capas seleccionadas
                const selectedLayers = Array.from(document.querySelectorAll('#layerOptions input:checked')).map(cb => cb.value);
                
                // Procesar cada capa seleccionada
                let processedCount = 0;
                let totalResultsCount = 0;

                for (const layerKey of selectedLayers) {
                    processedCount++;
                    const progress = 15 + (processedCount / selectedLayers.length) * 80;
                    updateProgress(progress, `Analizando capa: ${layerKey}…`);

                    let featuresToProcess = [];
                    let layerColor = '#333';
                    let layerName = layerKey;

                    // Obtener datos de la capa
                    if (layerKey === 'localidades') {
                        featuresToProcess = localitiesData.features;
                        layerColor = '#800020'; // Guinda
                        layerName = 'Localidades (Polígonos)';
                    } else if (layerKey === 'puntos') {
                        featuresToProcess = localitiesPointsData.features;
                        layerColor = '#B38E5D'; // Dorado
                        layerName = 'Localidades (Puntos)';
                    } else {
                        // Cargar capa dinámica
                        const data = await loadLayerData(layerKey);
                        if (data && data.features) {
                            featuresToProcess = data.features;
                            // Asignar color aleatorio o predefinido
                            layerColor = '#' + Math.floor(Math.random()*16777215).toString(16);
                        }
                    }

                    // Realizar intersección
                    const clippedFeatures = [];
                    const yieldUI = () => new Promise(res => setTimeout(res, 0));

                    // Procesamiento por lotes para no congelar UI
                    const batchSize = 1000;
                    for (let i = 0; i < featuresToProcess.length; i += batchSize) {
                        const batch = featuresToProcess.slice(i, i + batchSize);
                        batch.forEach(f => {
                            if (T.booleanIntersects(f.geometry, clipArea.geometry)) {
                                clippedFeatures.push(f);
                            }
                        });
                        if (i % 5000 === 0) await yieldUI();
                    }

                    // Guardar resultados
                    if (clippedFeatures.length > 0) {
                        layersData[layerKey] = {
                            name: layerName,
                            color: layerColor,
                            features: clippedFeatures
                        };
                        totalResultsCount += clippedFeatures.length;

                        // Agregar al mapa
                        const layerGroup = L.geoJSON(clippedFeatures, {
                            isResultLayer: true, // Flag para limpieza
                            style: { color: layerColor, weight: 2, opacity: 0.8, fillColor: layerColor, fillOpacity: 0.3 },
                            pointToLayer: (feature, latlng) => {
                                return L.circleMarker(latlng, { radius: 6, fillColor: layerColor, color: '#fff', weight: 1, opacity: 1, fillOpacity: 0.8 });
                            },
                            onEachFeature: (feature, layer) => {
                                const props = feature.properties;
                                let popupContent = `<div class="custom-popup-guinda font-body p-2">
                                    <h4 class="text-xs font-bold text-primary uppercase mb-1">${layerName}</h4>`;
                                Object.keys(props).forEach(k => {
                                    if (['CVEGEO', 'NOM_LOC', 'NOMBRE', 'PUEBLO', 'LENGUA'].includes(k) || k.length < 10) {
                                        popupContent += `<div class="text-[10px]"><span class="font-bold text-gray-600">${k}:</span> ${props[k]}</div>`;
                                    }
                                });
                                popupContent += `</div>`;
                                layer.bindPopup(popupContent);
                            }
                        }).addTo(map);
                    }
                }

                updateProgress(100, 'Finalizando…');
                
                // Actualizar UI de resultados
                const resultBtn = document.getElementById('floatingResultsBtn');
                const badge = document.getElementById('resultsBadgeCount');
                
                if (totalResultsCount > 0) {
                    resultBtn.classList.remove('tw-hidden');
                    badge.textContent = totalResultsCount;
                    
                    // Mostrar modal automáticamente si es la primera vez
                    openResultsModal();
                    
                    showAlert(`Análisis completado. ${totalResultsCount} elementos encontrados.`, 'success');
                } else {
                    resultBtn.classList.add('tw-hidden');
                    showAlert('No se encontraron elementos en el área seleccionada.', 'warning');
                }

            } catch (err) {
                console.error('Error durante el recorte:', err);
                showAlert('Error durante el procesamiento. Revisa la consola.', 'danger');
            } finally {
                hidePreloader();
            }
        }

        // ====================================================================
        // FUNCIONES DE REPORTES Y MODAL
        // ====================================================================

        window.openResultsModal = function() {
            const modal = document.getElementById('resultsModal');
            const container = document.getElementById('layerResultsContainer');
            const filters = document.getElementById('layerFilters');
            const countLabel = document.getElementById('totalElementsCount');
            
            modal.classList.add('active');
            
            // Generar filtros laterales
            filters.innerHTML = '';
            let total = 0;
            
            Object.keys(layersData).forEach(key => {
                const layer = layersData[key];
                const count = layer.features.length;
                total += count;
                
                const item = document.createElement('div');
                item.className = 'tw-flex tw-items-center tw-justify-between tw-p-3 tw-rounded-lg tw-cursor-pointer hover:tw-bg-gray-100 tw-transition-colors';
                item.innerHTML = `
                    <div class="tw-flex tw-items-center tw-gap-2">
                        <span class="tw-w-3 tw-h-3 tw-rounded-full" style="background-color: ${layer.color}"></span>
                        <span class="tw-text-xs tw-font-bold tw-text-gray-700">${layer.name}</span>
                    </div>
                    <span class="tw-bg-gray-200 tw-text-gray-600 tw-text-[10px] tw-font-bold tw-px-2 tw-py-0.5 tw-rounded-full">${count}</span>
                `;
                item.onclick = () => renderLayerTable(key);
                filters.appendChild(item);
            });
            
            countLabel.textContent = `${total} Elementos encontrados en total`;
            
            // Renderizar la primera capa por defecto
            const firstKey = Object.keys(layersData)[0];
            if (firstKey) renderLayerTable(firstKey);
        };

        window.closeResultsModal = function() {
            document.getElementById('resultsModal').classList.remove('active');
        };

        function renderLayerTable(layerKey) {
            const container = document.getElementById('layerResultsContainer');
            const layer = layersData[layerKey];
            const features = layer.features;
            
            // Obtener headers de propiedades (tomar del primer elemento)
            const props = features[0].properties;
            const headers = Object.keys(props); // Podríamos filtrar las más relevantes
            
            let html = `
                <div class="tw-mb-4 tw-flex tw-items-center tw-gap-2">
                    <span class="tw-w-4 tw-h-4 tw-rounded-full" style="background-color: ${layer.color}"></span>
                    <h3 class="tw-text-lg tw-font-bold tw-text-gray-800">${layer.name}</h3>
                </div>
                <div class="tw-overflow-x-auto">
                    <table class="tw-w-full tw-text-left tw-border-collapse">
                        <thead>
                            <tr class="tw-bg-gray-50 tw-border-b tw-border-gray-200">
                                <th class="tw-p-3 tw-text-[10px] tw-font-black tw-text-gray-400 tw-uppercase tw-tracking-wider">#</th>
                                ${headers.slice(0, 5).map(h => `<th class="tw-p-3 tw-text-[10px] tw-font-black tw-text-gray-400 tw-uppercase tw-tracking-wider">${h}</th>`).join('')}
                                <th class="tw-p-3 tw-text-[10px] tw-font-black tw-text-gray-400 tw-uppercase tw-tracking-wider">Acciones</th>
                            </tr>
                        </thead>
                        <tbody class="tw-divide-y tw-divide-gray-100">
            `;
            
            features.forEach((f, idx) => {
                html += `<tr class="hover:tw-bg-gray-50 tw-transition-colors">
                    <td class="tw-p-3 tw-text-xs tw-font-medium tw-text-gray-500">${idx + 1}</td>
                    ${headers.slice(0, 5).map(h => `<td class="tw-p-3 tw-text-xs tw-text-gray-700">${f.properties[h] || '-'}</td>`).join('')}
                    <td class="tw-p-3">
                        <button class="tw-text-primary hover:tw-underline tw-text-xs tw-font-bold" onclick="zoomToFeature('${layerKey}', ${idx})">Ver</button>
                    </td>
                </tr>`;
            });
            
            html += `</tbody></table></div>`;
            container.innerHTML = html;
        }

        window.zoomToFeature = function(layerKey, index) {
            closeResultsModal();
            const feature = layersData[layerKey].features[index];
            const layer = L.geoJSON(feature);
            const bounds = layer.getBounds();
            
            map.fitBounds(bounds, { maxZoom: 16, padding: [50, 50] });
            
            // Crear popup temporal
            L.popup()
                .setLatLng(bounds.getCenter())
                .setContent(`<div class="tw-font-bold tw-text-primary">Elemento #${index + 1}</div>`)
                .openOn(map);
        };

        window.downloadModalExcel = function() {
            const wb = XLSX.utils.book_new();
            
            Object.keys(layersData).forEach(key => {
                const layer = layersData[key];
                const data = layer.features.map(f => f.properties);
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, layer.name.substring(0, 30));
            });
            
            XLSX.writeFile(wb, 'Reporte_Geovisualizador_V2.xlsx');
        };
        
        window.exportMapToPNG = function() {
            // Ocultar controles temporalmente
            const controls = document.querySelectorAll('.leaflet-control, #controlPanel, #floatingResultsBtn, #openControl');
            controls.forEach(c => c.style.display = 'none');
            
            html2canvas(document.body, { useCORS: true }).then(canvas => {
                const link = document.createElement('a');
                link.download = 'mapa_analisis.png';
                link.href = canvas.toDataURL();
                link.click();
                
                // Restaurar controles
                controls.forEach(c => c.style.display = '');
            });
        };

        // ====================================================================
        // CONFIGURACIÓN DE EVENTOS DE INTERFAZ
        // ====================================================================

        // Carga de archivo
        kmlFileInput.addEventListener('change', (e) => {
            const hasFiles = e.target.files.length > 0;
            if (hasFiles) {
                processKmlFile(e.target.files[0]);
            }
        });

        // Botón Ejecutar
        uploadKmlBtn.addEventListener('click', () => {
            if (uploadKmlBtn.disabled) return;
            performClipping();
        });

        // Botón Limpiar
        clearMapBtn.addEventListener('click', async () => {
            if (await showConfirm({ message: '¿Limpiar todo el mapa?' })) {
                clearAllLayers();
            }
        });

    } catch (err) {
        console.error('Error crítico inicializando la aplicación:', err);
        alert('Error crítico al inicializar. Recarga la página.');
        hidePreloader();
    }
}

// ============================================================================
// INICIALIZACIÓN DE LA APLICACIÓN
// ============================================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
