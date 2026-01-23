/**
 * GEOVISUALIZADOR DE ÁREAS DE INTERÉS - VERSIÓN LOCALIDADES
 * ========================================================
 *
 * Esta herramienta ayuda a las personas a ver en un mapa qué localidades
 * (pueblos y ciudades) están dentro de una zona que eligen.
 * Pueden subir un archivo de zona y ver qué localidades se cruzan con esa zona.
 */

// ============================================================================
// CONFIGURACIÓN DE LA VERSIÓN
// ============================================================================

window.VERSION_CONFIG = {
    version: "V1",
    title: "Localidades + Indígenas",
    description: "Análisis Manual por Capas",
    autoAnalysis: false, // Modo manual (requiere click en botón)
    layers: 3
};

// Configuración de capas específica de V1
window.LAYER_CONFIG = {
    localidades: {
        name: 'Polígonos',
        color: '#3b82f6',
        icon: 'location_city',
        desc: 'Límites administrativos'
    },
    localities_points: {
        name: 'Puntos',
        color: '#10b981',
        icon: 'place',
        desc: 'Coordenadas geográficas'
    },
    loc_indigenas_datos: {
        name: 'Población',
        color: '#8b5cf6',
        icon: 'groups',
        desc: 'Datos demográficos'
    }
};

// Adaptador: convierte estructura V1 al formato estándar del modal
window.getAnalysisResults = function () {
    return layersData; // V1 usa layersData
};

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

// ============================================================================
// CONFIGURACIÓN GLOBAL DE DATOS (Phase 2: Lazy Loading)
// ============================================================================

const urls = {
    localidades: 'https://cdn.sassoapps.com/Gabvy/Gabvy_localidades_4326.geojson',
    localities_points: 'https://cdn.sassoapps.com/Gabvy/Gabvy_localidades_puntos.geojson',
    loc_indigenas_datos: 'https://cdn.sassoapps.com/Gabvy/Gabvy_loc_indigenas_datos.geojson'
};

const dataCache = new Map();

/**
 * Obtiene los datos de una capa de forma perezosa
 */
async function getLayerData(layerKey) {
    if (dataCache.has(layerKey)) return dataCache.get(layerKey);
    if (!urls[layerKey]) return null;
    try {
        console.log(`[LazyLoad] Solicitando ${layerKey}...`);
        const response = await fetch(urls[layerKey]);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        dataCache.set(layerKey, data);
        return data;
    } catch (e) {
        console.error(`Error cargando capa ${layerKey}:`, e);
        return { type: 'FeatureCollection', features: [] };
    }
}

// Variables para el reporte Excel
let totalElements = 0;              // Total de elementos encontrados
let layersData = {};                // Datos de todas las capas para el reporte

// Métricas del KML para reportes
let kmlMetrics = {
    fileName: '',
    uploadDate: '',
    area: 0, // en km²
    perimeter: 0, // en km
    centroid: null, // { lat, lng }
    bounds: null, // { north, south, east, west }
    vertexCount: 0,
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

// Variables para el modal de resultados
let currentModalData = null;         // Datos procesados para el modal
let currentActiveFilter = null;      // Capa actualmente seleccionada
let currentPage = 1;                 // Página actual de paginación
const ITEMS_PER_PAGE = 50;          // Items por página

// NOTA: LAYER_CONFIG se define al inicio del archivo en VERSION_CONFIG

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
    const container = document.getElementById('alertContainer');
    if (!container) {
        // Fallback si no existe el contenedor
        alert(message);
        return;
    }

    // Crear elemento de alerta Bootstrap
    const wrapper = document.createElement('div');
    wrapper.className = `alert alert-${type} alert-dismissible fade show shadow`;
    wrapper.setAttribute('role', 'alert');
    wrapper.innerHTML = `
        <div>${message}</div>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>
    `;

    container.appendChild(wrapper);

    // Auto-dismiss después del tiempo especificado
    if (timeoutMs > 0) {
        setTimeout(() => {
            wrapper.classList.remove('show');
            wrapper.addEventListener('transitionend', () => wrapper.remove());
        }, timeoutMs);
    }

    return wrapper;
}

// Utilidad: mostrar modal Bootstrap reutilizable
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
        // Si Bootstrap no está disponible, fallback a alerta
        showAlert(message, 'info', 5000);
    }
}

// Confirmación con modal. Devuelve una Promesa<boolean>.
function showConfirm({ title = 'Confirmar', message = '', okText = 'Aceptar', cancelText = 'Cancelar' } = {}) {
    return new Promise((resolve) => {
        const modalEl = document.getElementById('appModal');
        if (!modalEl) {
            // Fallback si no existe el modal
            resolve(confirm(message));
            return;
        }
        const titleEl = document.getElementById('appModalLabel');
        const bodyEl = document.getElementById('appModalBody');
        const okBtn = document.getElementById('appModalOkBtn');
        const cancelBtn = document.getElementById('appModalCancelBtn');
        if (titleEl) titleEl.textContent = title;
        if (bodyEl) bodyEl.innerHTML = message;
        if (okBtn) okBtn.textContent = okText;
        if (cancelBtn) {
            cancelBtn.textContent = cancelText;
            cancelBtn.style.display = '';
        }
        const modal = new bootstrap.Modal(modalEl);
        const cleanup = () => {
            okBtn && (okBtn.onclick = null);
            if (cancelBtn) {
                cancelBtn.onclick = null;
                cancelBtn.style.display = 'none';
            }
        };
        okBtn && (okBtn.onclick = () => { cleanup(); resolve(true); });
        cancelBtn && (cancelBtn.onclick = () => { cleanup(); resolve(false); });
        modalEl.addEventListener('hidden.bs.modal', () => { cleanup(); }, { once: true });
        modal.show();
    });
}

/**
 * Oculta el preloader de forma robusta con transición suave
 * El preloader se muestra durante operaciones largas como el recorte de localidades
 */
function hidePreloader() {
    const pre = document.getElementById('preloader');
    if (!pre) return;
    pre.classList.add('preloader-hide');
    setTimeout(() => {
        pre.style.display = 'none';
        pre.setAttribute('hidden', '');
        if (typeof map !== 'undefined' && map) {
            setTimeout(() => map.invalidateSize(), 150);
        }
    }, 400);
}

/**
 * Muestra el preloader durante operaciones largas
 * Crea el overlay dinámicamente si no existe
 */
function showPreloader() {
    let pre = document.getElementById('preloader');

    if (!pre) {
        // Crear overlay de carga con branding institucional
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
    updateProgress(0, 'Iniciando...');
    pre.classList.remove('preloader-hide');
    pre.removeAttribute('hidden');
    pre.style.display = 'flex';
}

/**
 * Actualiza la barra de progreso y mensaje del preloader
 * @param {number} percent - Porcentaje de progreso (0-100)
 * @param {string} message - Mensaje descriptivo del progreso actual
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
            personal: 'jAAFQsMBZ9a6VIm2dCwg',  // Tu API key
            amigo: 'xRR3xCujdkUjxkDqlNTG'     // API key del amigo
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

        // Mapas originales del amigo con su API key
        const SenerLightOriginal = createMapTilerLayer(
            '0198a9af-dc7c-79d3-8316-a80767ad1d0f', // Style ID original del amigo
            'amigo', // Usar API key del amigo
            'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
            '&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            'SENER Light Original'
        );

        const SenerDarkOriginal = createMapTilerLayer(
            '0198a9f0-f135-7991-aaec-bea71681556e', // Style ID original del amigo
            'amigo', // Usar API key del amigo
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
            layers: [baseMaps['SENER Light']],
            zoomControl: false // Desactivar control de zoom por defecto
        });

        map.on('click', function (e) {
            // Si el clic no fue en una capa, limpiar el resaltado
            if (e.originalEvent.target.classList.contains('leaflet-container')) {
                clearHighlight();
                // También deseleccionar cualquier elemento de la lista
                const items = cvegeoListDiv.querySelectorAll('li');
                items.forEach(li => {
                    li.classList.remove('active');
                });
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

        // layersControl = L.control.layers(baseMaps, {}, { collapsed: false }).addTo(map); // Eliminado a petición del usuario

        // ====================================================================
        // CONFIGURACIÓN DE DATOS Y ELEMENTOS DEL DOM
        // ====================================================================

        // URLs de servicios de localidades (datos geoespaciales de INEGI)
        const localitiesUrl = 'https://cdn.sassoapps.com/Gabvy/localidades_4326.geojson';
        const localitiesPointsUrl = 'https://cdn.sassoapps.com/Gabvy/localidades_puntos.geojson'; // Puntos

        // Referencias a elementos del DOM para controles
        const kmlFileInput = document.getElementById('kmlFile');
        // const uploadKmlBtn = document.getElementById('uploadKmlBtn'); // Eliminado
        const areaTypeSelect = document.getElementById('clipTypeSelect');
        const bufferMetersGroup = document.getElementById('customBufferContainer');
        const bufferMetersInput = document.getElementById('customBufferInput');
        const performClipBtn = document.getElementById('performClipBtn');
        const resetViewBtn = document.getElementById('resetViewBtn');
        const clearMapBtn = document.getElementById('clearMap');
        const centerKmlBtn = document.getElementById('centerKmlBtn');
        const cvegeoListDiv = document.getElementById('cvegeoList');

        // Validar elementos críticos
        if (!performClipBtn) {
            console.error('ERROR: No se encontró el elemento performClipBtn');
            showAlert('Error de inicialización: falta elemento performClipBtn', 'danger');
        }
        if (!areaTypeSelect) {
            console.error('ERROR: No se encontró el elemento clipTypeSelect');
            showAlert('Error de inicialización: falta elemento clipTypeSelect', 'danger');
        }

        // Mapa para mantener referencias de features por CVEGEO (para navegación)
        let featureLayersById = new Map(); // CVEGEO -> {bounds|latlng, layer}

        // Estado inicial: deshabilitar botones hasta que se carguen datos
        // if (uploadKmlBtn) uploadKmlBtn.disabled = true;
        if (performClipBtn) performClipBtn.disabled = true;

        /**
         * Actualiza la visualización del buffer en el mapa sin realizar el recorte
         * Permite al usuario previsualizar el área de influencia
         */
        async function updateBufferPreview() {
            if (!kmlGeoJson) return;

            const kmlPolygon = kmlGeoJson.features.find(f =>
                f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
            );

            if (!kmlPolygon) return;

            // Asegurar disponibilidad de Turf
            const T = await ensureTurf();

            // Limpiar buffer previo
            if (bufferLayer) {
                map.removeLayer(bufferLayer);
                bufferLayer = null;
            }

            const areaType = areaTypeSelect.value;
            let bufferDistance = 0;

            if (areaType === 'custom') {
                const kmValue = parseFloat(bufferMetersInput?.value || '0.5');
                bufferDistance = Math.max(0, kmValue * 1000);
            } else if (areaType === 'direct') {
                bufferDistance = 2000; // 2km
            } else if (areaType === 'indirect') {
                bufferDistance = 5000; // 5km
            }

            if (bufferDistance > 0) {
                try {
                    const buffer = T.buffer(kmlPolygon, bufferDistance, { units: 'meters' });

                    bufferLayer = L.geoJSON(buffer, {
                        style: {
                            color: areaType === 'custom' ? '#0078ff' : '#B8860B',
                            weight: 2,
                            fillOpacity: 0.1,
                            dashArray: '5, 5' // Línea punteada para preview
                        },
                        interactive: false // No bloquear clicks
                    }).addTo(map);

                } catch (e) {
                    console.warn('Error generando preview del buffer:', e);
                }
            }
        }

        // Mostrar/ocultar input de buffer según el tipo
        if (areaTypeSelect && bufferMetersGroup) {
            const syncBufferVisibility = () => {
                if (areaTypeSelect.value === 'custom') {
                    bufferMetersGroup.classList.remove('tw-hidden');
                } else {
                    bufferMetersGroup.classList.add('tw-hidden');
                }
                // Actualizar preview al cambiar tipo
                updateBufferPreview();
            };
            syncBufferVisibility();
            areaTypeSelect.addEventListener('change', syncBufferVisibility);

            // Actualizar preview al cambiar valor custom
            if (bufferMetersInput) {
                bufferMetersInput.addEventListener('input', () => {
                    if (areaTypeSelect.value === 'custom') {
                        updateBufferPreview();
                    }
                });
            }
        }

        // ====================================================================
        // FUNCIONES DE MANEJO DE DATOS GEOESPACIALES
        // ====================================================================

        /**
         * Carga los datos de localidades desde el servidor de forma asíncrona
         * Los datos provienen de INEGI y contienen información geoespacial de todas
         * las localidades de México con sus respectivos CVEGEO
         */
        async function loadLocalitiesData() {
            showPreloader();
            updateProgress(100, 'Sistema de localidades listo (Carga perezosa)');

            // Habilitar controles inmediatamente en modo lazy
            // if (uploadKmlBtn) uploadKmlBtn.disabled = false;
            // if (performClipBtn) performClipBtn.disabled = false; // Mantener deshabilitado hasta cargar KML

            setTimeout(() => {
                hidePreloader();
                // showAlert('Visualizador V1 listo. Las localidades se cargarán al analizar el KML.', 'success', 3000);
            }, 500);
        }

        /**
         * Limpia todas las capas del mapa y resetea el estado de la aplicación
         * Útil para reiniciar el flujo de trabajo o limpiar datos obsoletos
         */
        function clearAllLayers() {
            // Remover todas las capas del mapa
            if (kmlLayer) map.removeLayer(kmlLayer);
            if (bufferLayer) map.removeLayer(bufferLayer);
            if (clippedLocalitiesLayer) map.removeLayer(clippedLocalitiesLayer);
            if (clippedPointsLayer) map.removeLayer(clippedPointsLayer);
            if (labelLayer) map.removeLayer(labelLayer);

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

            // Resetear UI a estado inicial
            cvegeoListDiv.innerHTML = '<p class="mb-0 text-muted">Sube un KML y realiza el recorte para ver la lista.</p>';
            // uploadKmlBtn.disabled = true;
            performClipBtn.disabled = true;
            if (centerKmlBtn) centerKmlBtn.disabled = true;
            if (resetViewBtn) resetViewBtn.disabled = true;

            // Resetear contadores y badges
            const badge = document.getElementById('foundCountBadge');
            if (badge) badge.textContent = formatNumber(0);
            const totalFound = document.getElementById('totalFound');
            if (totalFound) totalFound.textContent = formatNumber(0);
            const currentCriteria = document.getElementById('currentCriteria');
            if (currentCriteria) currentCriteria.textContent = '—';
        }

        // ====================================================================
        // FUNCIONES DE NAVEGACIÓN Y VISUALIZACIÓN
        // ====================================================================

        /**
         * Establece un elemento como activo en la lista de CVEGEO
         * Proporciona feedback visual al usuario sobre qué localidad está seleccionada
         * @param {string} targetId - CVEGEO de la localidad a destacar
         */
        function setActiveListItem(targetId) {
            const items = cvegeoListDiv.querySelectorAll('li');
            items.forEach(li => {
                if (li.dataset.cvegeo === targetId) {
                    li.classList.add('active');
                    // Scroll suave para mantener el elemento visible
                    try {
                        li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    } catch (_) {
                        /* Fallback silencioso si scrollIntoView no está disponible */
                    }
                } else {
                    li.classList.remove('active');
                }
            });
        }

        /**
         * Limpia cualquier resaltado existente en el mapa.
         */
        function clearHighlight() {
            if (highlightedLayer) {
                // Restablecer el estilo de la capa previamente resaltada
                if (typeof highlightedLayer.setStyle === 'function') {
                    // Para polígonos o formas, restablecer estilo
                    highlightedLayer.setStyle(highlightedLayer.options.originalStyle);
                }
                highlightedLayer = null;
            }
        }

        /**
         * Navega suavemente a una feature específica en el mapa y la resalta.
         * Ajusta automáticamente el zoom y centrado óptimos según el tipo de geometría.
         * @param {object} ref - Referencia que contiene bounds o latlng de la feature y la capa.
         */
        function goToFeatureRef(ref) {
            if (!ref) return;

            // Si la capa seleccionada ya está resaltada, límpiela y regrese
            if (highlightedLayer === ref.layer) {
                clearHighlight();
                return;
            }

            // Limpiar el resaltado anterior
            clearHighlight();

            // Resaltar la nueva capa
            if (ref.layer && typeof ref.layer.setStyle === 'function') {
                highlightedLayer = ref.layer;
                // Guardar el estilo original si no se ha guardado
                if (!highlightedLayer.options.originalStyle) {
                    highlightedLayer.options.originalStyle = {
                        color: highlightedLayer.options.color,
                        weight: highlightedLayer.options.weight,
                        opacity: highlightedLayer.options.opacity,
                        fillColor: highlightedLayer.options.fillColor,
                        fillOpacity: highlightedLayer.options.fillOpacity
                    };
                }
                // Aplicar estilo de resaltado
                highlightedLayer.setStyle({
                    color: '#FFFF00', // Amarillo brillante
                    weight: 5,
                    opacity: 1,
                    fillColor: '#FFFF00',
                    fillOpacity: 0.7
                });
                // Asegurarse de que la capa resaltada esté al frente
                if (typeof highlightedLayer.bringToFront === 'function') {
                    highlightedLayer.bringToFront();
                }
            }

            if (ref.bounds && ref.bounds.isValid()) {
                // Para polígonos, usar fitBounds para una mejor vista con padding
                map.fitBounds(ref.bounds, {
                    padding: [50, 50], // 50px de margen
                    maxZoom: 16,
                    animate: true,
                    duration: 0.6
                });
            } else if (ref.latlng) {
                // Para puntos, también usar fitBounds creando un área pequeña alrededor
                const pointBounds = L.latLngBounds(ref.latlng, ref.latlng);
                map.fitBounds(pointBounds, {
                    padding: [50, 50],
                    maxZoom: 16, // Zoom consistente para puntos
                    animate: true,
                    duration: 0.6
                });
            }
        }

        /**
         * Genera y muestra la lista de CVEGEO encontradas en el recorte
         * Incluye código de colores y funcionalidad de navegación al hacer clic
         * @param {Array} features - Array de features GeoJSON de localidades
         * @param {Map} colorsById - Mapa de CVEGEO a color asignado
         */
        function displayCvegeoList(features, colorsById) {
            if (features.length === 0) {
                cvegeoListDiv.innerHTML = '<p>No se encontraron localidades dentro del área.</p>';
                return;
            }

            // Habilitar/deshabilitar botones de descarga
            const downloadReportBtn = document.getElementById('downloadReportBtn');
            if (downloadReportBtn) {
                downloadReportBtn.disabled = features.length === 0;
            }

            // Mostrar/ocultar contenedor de gráficos
            const chartsContainer = document.getElementById('chartsContainer');
            if (chartsContainer) {
                if (features.length > 0) {
                    chartsContainer.style.display = 'block';
                    generateCharts({ localidades: { features: features } });
                } else {
                    chartsContainer.style.display = 'none';
                }
            }

            // Construir lista interactiva con código de colores
            const ul = document.createElement('ul');
            features.forEach(f => {
                if (f.properties.CVEGEO) {
                    const li = document.createElement('li');
                    const color = colorsById.get(f.properties.CVEGEO) || '#008000';
                    const nombre = f.properties.NOM_LOC || f.properties.NOMGEO || 'Sin nombre';
                    const cvegeo = f.properties.CVEGEO;
                    li.innerHTML = `<span class="color-dot" style="background:${color}"></span>${nombre} (${cvegeo})`;
                    li.dataset.cvegeo = cvegeo;
                    li.setAttribute('role', 'button');
                    li.setAttribute('tabindex', '0');
                    li.setAttribute('aria-label', `Ir a localidad ${nombre} (${cvegeo})`);
                    ul.appendChild(li);
                }
            });

            cvegeoListDiv.innerHTML = '';
            cvegeoListDiv.appendChild(ul);

            // Actualizar contadores en la interfaz
            const badge = document.getElementById('foundCountBadge');
            if (badge) badge.textContent = formatNumber(features.length);
            const totalFound = document.getElementById('totalFound');
            if (totalFound) totalFound.textContent = formatNumber(features.length);
            const currentCriteria = document.getElementById('currentCriteria');
            if (currentCriteria) {
                currentCriteria.textContent = areaTypeSelect.options[areaTypeSelect.selectedIndex].text;
            }

            // Agregar interactividad: click en elemento de la lista centra en esa localidad
            ul.querySelectorAll('li').forEach(li => {
                li.addEventListener('click', () => {
                    const id = li.dataset.cvegeo;
                    const ref = featureLayersById.get(id);
                    if (!ref) return;

                    setActiveListItem(id);
                    goToFeatureRef(ref);

                    // Abrir popup si está disponible
                    if (ref.layer && ref.layer.openPopup) {
                        ref.layer.openPopup();
                    }
                });

                // Soporte para navegación con teclado
                li.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        li.click();
                    }
                });
            });
        }

        // ====================================================================
        // PROCESAMIENTO DE ARCHIVOS KML
        // ====================================================================

        /**
         * Valida que el archivo seleccionado sea un KML válido
         * @param {File} file - Archivo a validar
         * @returns {boolean} - true si el archivo es válido
         */
        function validateKmlFile(file) {
            // Validar extensión
            const validExtensions = ['.kml', '.kmz'];
            const fileName = file.name.toLowerCase();
            const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));

            if (!hasValidExtension) {
                showAlert('Por favor, selecciona un archivo con extensión .kml o .kmz', 'warning');
                return false;
            }

            // Validar tamaño (máximo 10MB)
            const maxSize = 10 * 1024 * 1024; // 10MB en bytes
            if (file.size > maxSize) {
                showAlert('El archivo es demasiado grande. El tamaño máximo permitido es 10MB.', 'warning');
                return false;
            }

            return true;
        }

        /**
         * Procesa un archivo KML cargado por el usuario
         * Convierte el KML a GeoJSON y lo visualiza en el mapa
         * @param {File} file - Archivo KML seleccionado por el usuario
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

                    const polygons = kmlGeoJson.features.filter(f =>
                        f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
                    );

                    if (polygons.length === 0) {
                        showAlert(
                            'El archivo KML no contiene un polígono válido. ' +
                            'Por favor, asegúrate de que el archivo contenga geometrías de tipo Polygon o MultiPolygon.',
                            'warning'
                        );
                        performClipBtn.disabled = true;
                        return;
                    }

                    const validPolygons = polygons.filter(polygon => {
                        if (!polygon.geometry || !polygon.geometry.coordinates) return false;
                        if (polygon.geometry.type === 'Polygon') {
                            return polygon.geometry.coordinates.length > 0 && polygon.geometry.coordinates[0].length >= 4;
                        }
                        if (polygon.geometry.type === 'MultiPolygon') {
                            return polygon.geometry.coordinates.length > 0 && polygon.geometry.coordinates.every(poly => poly.length > 0 && poly[0].length >= 4);
                        }
                        return false;
                    });

                    if (validPolygons.length === 0) {
                        showAlert('El archivo KML contiene geometrías inválidas o vacías', 'warning');
                        performClipBtn.disabled = true;
                        return;
                    }

                    let hasOverlaps = false;
                    let overlapDetails = [];
                    if (validPolygons.length > 1) {
                        for (let i = 0; i < validPolygons.length; i++) {
                            for (let j = i + 1; j < validPolygons.length; j++) {
                                try {
                                    if (turf.booleanOverlap(validPolygons[i], validPolygons[j])) {
                                        hasOverlaps = true;
                                        overlapDetails.push({ polygon1: i + 1, polygon2: j + 1 });
                                    }
                                } catch (overlapError) {
                                    console.warn(`Error checking overlap between polygons ${i + 1} and ${j + 1}:`, overlapError);
                                    hasOverlaps = true;
                                    overlapDetails.push({ polygon1: i + 1, polygon2: j + 1, error: 'Error en verificación' });
                                }
                            }
                        }
                    }

                    const allPolygonCoordinates = [];
                    validPolygons.forEach(p => {
                        if (p.geometry.type === 'Polygon') {
                            allPolygonCoordinates.push(p.geometry.coordinates);
                        } else if (p.geometry.type === 'MultiPolygon') {
                            p.geometry.coordinates.forEach(polyCoords => {
                                allPolygonCoordinates.push(polyCoords);
                            });
                        }
                    });

                    let kmlPolygonFeature;
                    if (allPolygonCoordinates.length === 1) {
                        kmlPolygonFeature = {
                            type: 'Feature',
                            properties: validPolygons[0].properties || {},
                            geometry: {
                                type: 'Polygon',
                                coordinates: allPolygonCoordinates[0]
                            }
                        };
                    } else {
                        kmlPolygonFeature = {
                            type: 'Feature',
                            properties: validPolygons[0].properties || {},
                            geometry: {
                                type: 'MultiPolygon',
                                coordinates: allPolygonCoordinates
                            }
                        };
                    }

                    kmlGeoJson.features = [kmlPolygonFeature];

                    kmlMetrics.hasOverlaps = hasOverlaps;
                    kmlMetrics.overlapCount = overlapDetails.length;
                    kmlMetrics.polygonCount = validPolygons.length;

                    // Calcular métricas adicionales del KML
                    try {
                        kmlMetrics.fileName = file.name;
                        kmlMetrics.uploadDate = new Date().toLocaleDateString('es-MX');
                        kmlMetrics.geometryType = kmlPolygonFeature.geometry.type;

                        // Calcular área en km²
                        const areaM2 = T.area(kmlPolygonFeature);
                        kmlMetrics.area = (areaM2 / 1000000).toFixed(2);

                        // Calcular perímetro en km
                        const perimeterM = T.length(T.polygonToLine(kmlPolygonFeature), { units: 'meters' });
                        kmlMetrics.perimeter = (perimeterM / 1000).toFixed(2);

                        // Calcular centroide
                        const centroid = T.centroid(kmlPolygonFeature);
                        kmlMetrics.centroid = {
                            lat: centroid.geometry.coordinates[1],
                            lng: centroid.geometry.coordinates[0]
                        };

                        // Calcular bounds
                        const bbox = T.bbox(kmlPolygonFeature);
                        kmlMetrics.bounds = {
                            west: bbox[0],
                            south: bbox[1],
                            east: bbox[2],
                            north: bbox[3]
                        };

                        // Contar vértices
                        let vertexCount = 0;
                        if (kmlPolygonFeature.geometry.type === 'Polygon') {
                            kmlPolygonFeature.geometry.coordinates.forEach(ring => {
                                vertexCount += ring.length;
                            });
                        } else if (kmlPolygonFeature.geometry.type === 'MultiPolygon') {
                            kmlPolygonFeature.geometry.coordinates.forEach(polygon => {
                                polygon.forEach(ring => {
                                    vertexCount += ring.length;
                                });
                            });
                        }
                        kmlMetrics.vertexCount = vertexCount;

                    } catch (metricsError) {
                        console.warn('Error calculando métricas del KML:', metricsError);
                    }

                    if (kmlLayer) map.removeLayer(kmlLayer);

                    kmlLayer = L.geoJSON(kmlPolygonFeature, {
                        style: hasOverlaps ? { color: '#ff6b35', weight: 4, fillColor: '#ff6b35', fillOpacity: 0.4, dashArray: '10,5' } : { color: '#ff7800', weight: 3, fillColor: '#ffa500', fillOpacity: 0.2 }
                    }).addTo(map);

                    if (hasOverlaps) {
                        let overlapDetailsHtml = '';
                        if (overlapDetails && overlapDetails.length > 0) {
                            overlapDetailsHtml = '<p><strong>Superposiciones detectadas:</strong></p><ul>';
                            overlapDetails.slice(0, 5).forEach(detail => {
                                overlapDetailsHtml += `<li>Polígono ${detail.polygon1} se superpone con Polígono ${detail.polygon2}</li>`;
                            });
                            if (overlapDetails.length > 5) {
                                overlapDetailsHtml += `<li>... y ${overlapDetails.length - 5} superposiciones más</li>`;
                            }
                            overlapDetailsHtml += '</ul>';
                        }
                        setTimeout(() => {
                            showModal({
                                title: '⚠️ Polígonos Superpuestos Detectados',
                                message: `
                                    <div class="alert alert-warning">
                                        <strong>Se detectaron superposiciones en el KML "${file.name}"</strong>
                                    </div>
                                    <p><strong>Detalles del problema:</strong></p>
                                    <ul>
                                        <li>Número de polígonos: ${validPolygons.length}</li>
                                        <li>Superposiciones encontradas: ${overlapDetails?.length || 'Múltiples'}</li>
                                        <li>Posible conteo duplicado en zonas de superposición</li>
                                    </ul>
                                    ${overlapDetailsHtml}
                                    <div class="alert alert-info small mt-3">
                                        <strong>Recomendación:</strong> Revisar el archivo KML para corregir las superposiciones.
                                    </div>
                                `,
                                okText: 'Entendido'
                            });
                        }, 1000);
                    }

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
                    showAlert(`KML cargado. Se encontraron ${validPolygons.length} polígonos.`, 'success');

                    // Generar previsualización del buffer inicial
                    updateBufferPreview();

                } catch (error) {
                    console.error('Error procesando KML:', error);
                    showAlert('Error procesando el archivo KML. Verifique que sea válido.', 'danger', 8000);
                }
            };

            reader.onerror = function () {
                showAlert('Error al leer el archivo.', 'danger');
            };

            reader.readAsText(file);
        }

        // ====================================================================
        // PROCESAMIENTO GEOESPACIAL PRINCIPAL
        // ====================================================================

        /**
         * FUNCIÓN PRINCIPAL: Realiza el recorte de localidades según el área seleccionada
         * ==================================================================================
         * 
         * Esta es la función más compleja y crítica del sistema. Ejecuta el algoritmo
         * de análisis geoespacial que constituye el núcleo de la aplicación.
         * 
         * PROCESO DETALLADO:
         * 1. Carga las localidades desde INEGI si no están en memoria (30,000+ registros)
         * 2. Genera buffers de 500m para área núcleo utilizando Turf.js
         * 3. Realiza intersecciones geoespaciales masivas entre localidades y área de interés
         * 4. Aplica filtros de tipo de área (núcleo, directa, indirecta)
         * 5. Visualiza los resultados con colores diferenciados por CVEGEO
         * 6. Genera etiquetas interactivas y navegación en mapa
         * 
         * LIBRERÍAS INVOLUCRADAS:
         * - Turf.js: Para operaciones geoespaciales (buffer, intersect, centroid)
         * - Leaflet.js: Para visualización de capas en el mapa
         * - togeojson.js: Ya ejecutada previamente para conversión KML→GeoJSON
         * 
         * RENDIMIENTO: Procesamiento optimizado en lotes para mantener UI responsiva
         */
        async function performClipping() {
            // Mostrar preloader durante procesamiento intensivo
            showPreloader();
            updateProgress(3, 'Validando insumos…');

            // ================================================================
            // VALIDACIONES INICIALES
            // ================================================================

            if (!kmlGeoJson) {
                showModal({
                    title: 'Recorte de Localidades',
                    message: 'Primero carga un archivo KML válido para poder realizar el recorte.',
                    okText: 'Entendido'
                });
                hidePreloader();
                return;
            }

            try {
                // ============================================================
                // PREPARACIÓN DE HERRAMIENTAS Y DATOS
                // ============================================================

                // Asegurar disponibilidad de Turf.js para operaciones geoespaciales
                const T = await ensureTurf();
                updateProgress(8, 'Realizando el análisis, por favor espere…');

                // Cargar localidades bajo demanda si no están en memoria
                if (!localitiesData) {
                    await loadLocalitiesData();
                    updateProgress(12, 'Localidades cargadas. Preparando geometrías…');
                    if (!localitiesData) return; // Abortar si falló la carga
                }

                // Limpiar capas previas para nueva operación
                // if (bufferLayer) map.removeLayer(bufferLayer); // No borrar buffer si ya es preview
                if (clippedLocalitiesLayer) map.removeLayer(clippedLocalitiesLayer);
                if (labelLayer) map.removeLayer(labelLayer);

                // ============================================================
                // PREPARACIÓN DEL ÁREA DE RECORTE
                // ============================================================

                const areaType = areaTypeSelect.value;
                const kmlPolygon = kmlGeoJson.features.find(f =>
                    f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
                );
                let clipArea = kmlPolygon;

                // Definir distancias automáticas
                let bufferDistance = 0;

                // Mapear valores de HTML (exact, direct, indirect, custom) a lógica interna
                if (areaType === 'custom') {
                    // El input en HTML está en KM (placeholder="Kms"), convertir a metros
                    const kmValue = parseFloat(bufferMetersInput?.value || '0.5');
                    bufferDistance = Math.max(0, kmValue * 1000);
                } else if (areaType === 'direct') {
                    bufferDistance = 2000; // 2km automático
                } else if (areaType === 'indirect') {
                    bufferDistance = 5000; // 5km automático
                }
                // 'exact' resulta en bufferDistance = 0

                if (bufferDistance > 0) {
                    try {
                        const buffer = T.buffer(kmlPolygon, bufferDistance, { units: 'meters' });
                        clipArea = buffer;

                        // Asegurar que el buffer esté visualizado (usando el existente o creando uno nuevo)
                        if (!bufferLayer) {
                            bufferLayer = L.geoJSON(buffer, {
                                style: {
                                    color: areaType === 'custom' ? '#0078ff' : '#B8860B',
                                    weight: 2,
                                    fillOpacity: 0.1
                                }
                            }).addTo(map);
                        } else {
                            // Actualizar estilo a línea sólida (no punteada) para análisis confirmado
                            bufferLayer.setStyle({
                                dashArray: null,
                                fillOpacity: 0.15
                            });
                        }

                        updateProgress(15, `Zona de influencia (${bufferDistance.toLocaleString('es-MX')} m) generada.`);

                    } catch (e) {
                        console.error('Error creando buffer:', e);
                        showModal({
                            title: 'Error al generar zona de influencia',
                            message: 'No se pudo crear el buffer solicitado. Verifica la geometría del KML.',
                            okText: 'Cerrar'
                        });
                        hidePreloader();
                        return;
                    }
                }

                // ============================================================
                // PROCESAMIENTO DE INTERSECCIONES GEOESPACIALES MASIVAS
                // ============================================================

                /*
                 * ALGORITMO CLAVE: Recorrido y evaluación de todas las localidades
                 * 
                 * CÓMO SE RECORREN LAS PROPIEDADES:
                 * 1. Se itera sobre localitiesData.features[] que contiene ~30,000 localidades
                 * 2. Cada feature tiene structure: {geometry: {...}, properties: {CVEGEO, NOM_LOC, AMBITO, ...}}
                 * 3. Se extrae geometry.coordinates para operaciones espaciales
                 * 4. Se evalúa intersección geométrica con Turf.js booleanIntersects()
                 * 5. Si intersecta, se agrega la feature COMPLETA al arreglo resultado
                 * 
                 * CÓMO SE GENERA EL ARREGLO FINAL:
                 * - clipped[] inicia vacío
                 * - Por cada localidad que intersecta: clipped.push(localidad_completa)  
                 * - Resultado: Array de features GeoJSON con todas sus propiedades preservadas
                 * - No se modifican datos originales, solo se filtran por intersección espacial
                 * 
                 * OPTIMIZACIÓN: Procesamiento en lotes para no bloquear la interfaz
                 */

                const clipped = [];  // Arreglo resultado que almacenará localidades intersectantes
                const locData = await getLayerData('localidades');
                const features = Array.isArray(locData?.features) ? locData.features : [];
                const total = features.length;
                let processed = 0;  // Contador de progreso

                // Configurar procesamiento en lotes para permitir repintado de UI
                const base = 20; // % reservado para setup inicial  
                const loopSpan = 70; // % dedicado al bucle de intersección
                const batchSize = 500;

                // Función para ceder control al navegador y permitir repintado de UI
                const yieldUI = () => new Promise(res => (window.requestAnimationFrame ? requestAnimationFrame(() => res()) : setTimeout(res, 0)));

                // BUCLE PRINCIPAL: Procesar localidades en lotes
                for (let start = 0; start < total; start += batchSize) {
                    const end = Math.min(start + batchSize, total);

                    // Procesar lote actual
                    for (let i = start; i < end; i++) {
                        const loc = features[i];  // Localidad individual con todas sus propiedades

                        /*
                         * OPERACIÓN CRÍTICA: Evaluación de intersección geoespacial
                         * 
                         * T.booleanIntersects() determina si dos geometrías se superponen:
                         * - loc.geometry: Geometría de la localidad (Point, Polygon, etc.)
                         * - clipArea.geometry: Área de interés (Polygon del KML o buffer)
                         * 
                         * Algoritmo interno utiliza:
                         * - Para puntos: Point-in-polygon con ray casting
                         * - Para polígonos: Intersección de bordes y overlapping
                         * - Manejo automático de diferentes tipos geométricos
                         */
                        if (T.booleanIntersects(loc.geometry, clipArea.geometry)) {
                            loc.properties.origen = 'Capa de Poligonos';
                            clipped.push(loc);  // Agregar localidad completa al resultado
                        }
                    }

                    // Actualizar progreso y estadísticas
                    processed = end;
                    const frac = processed / Math.max(1, total);
                    const pct = base + loopSpan * frac; // Progreso de 20% a 95%
                    updateProgress(pct, `Procesando localidades… ${processed}/${total}`);

                    // Ceder control al navegador para repintar barra de progreso y spinner
                    await yieldUI();
                }

                // Procesar puntos adicionales que no tengan polígono
                const clippedPoints = [];
                const existingCvegeo = new Set(clipped.map(f => f.properties?.CVEGEO).filter(Boolean));

                const lpData = await getLayerData('localities_points');
                if (lpData && lpData.features) {
                    updateProgress(92, `Procesando puntos adicionales…`);
                    const pointFeatures = lpData.features;
                    const totalPoints = pointFeatures.length;

                    for (let i = 0; i < totalPoints; i += 500) {
                        const batch = pointFeatures.slice(i, i + 500);
                        batch.forEach(pt => {
                            const id = pt.properties?.CVEGEO;
                            if (id && !existingCvegeo.has(id)) {
                                try {
                                    if (T.booleanIntersects(pt.geometry, clipArea.geometry)) {
                                        pt.properties.origen = 'Capa de Coordenadas';
                                        clippedPoints.push(pt);
                                    }
                                } catch (_) { }
                            }
                        });
                        updateProgress(92 + (i / totalPoints) * 5, `Filtrando puntos…`);
                        await yieldUI();
                    }
                }

                updateProgress(94, `Integrando datos demográficos (Indígenas/Afro)…`);
                const indData = await getLayerData('loc_indigenas_datos');
                const indMap = new Map();
                if (indData && indData.features) {
                    indData.features.forEach(f => {
                        const id = f.properties?.cvegeo || f.properties?.CVEGEO;
                        if (id) indMap.set(id, f.properties);
                    });
                }

                // Fusionar datos demográficos
                const finalFeatures = [...clipped, ...clippedPoints].map(f => {
                    const id = f.properties?.CVEGEO;
                    if (id && indMap.has(id)) {
                        f.properties = { ...f.properties, ...indMap.get(id), dataDemografica: true };
                    }
                    return f;
                });

                const totalIndigena = finalFeatures.reduce((acc, f) => acc + (parseFloat(f.properties?.PIHOGARES || 0)), 0);
                const totalAfro = finalFeatures.reduce((acc, f) => acc + (parseFloat(f.properties?.POB_AFRO || 0)), 0);

                updateProgress(97, `Encontradas ${finalFeatures.length} localidades. Preparando visualización…`);

                // ============================================================
                // VISUALIZACIÓN DE RESULTADOS Y GENERACIÓN DE CAPAS
                // ============================================================

                // Poblar layersData para reportes y modal
                layersData = {};

                // Capa principal: localidades (polígonos + puntos combinados)
                if (finalFeatures.length > 0) {
                    layersData.localidades = {
                        features: finalFeatures,
                        totalIndigena,
                        totalAfro
                    };
                }

                totalElements = finalFeatures.length;

                if (finalFeatures.length > 0) {
                    // Actualizar badges demográficos
                    const indBadge = document.getElementById('indigenasCountBadge');
                    const afroBadge = document.getElementById('afroCountBadge');
                    if (indBadge) {
                        indBadge.innerHTML = `<strong>${formatNumber(totalIndigena)}</strong> Pueblos Indígenas`;
                        indBadge.classList.toggle('tw-hidden', totalIndigena === 0);
                    }
                    if (afroBadge) {
                        afroBadge.innerHTML = `<strong>${formatNumber(totalAfro)}</strong> Afromexicanos`;
                        afroBadge.classList.toggle('tw-hidden', totalAfro === 0);
                    }
                    // Generar paleta de colores distinta por CVEGEO
                    const colorsById = new Map();
                    const palette = [
                        '#d11149', '#1a8fe3', '#119822', '#ff7f0e', '#9467bd',
                        '#e377c2', '#17becf', '#bcbd22', '#8c564b', '#2ca02c',
                        '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
                        '#a65628', '#f781bf', '#999999', '#66c2a5', '#fc8d62'
                    ];

                    let colorIndex = 0;
                    const allFeatures = finalFeatures;
                    for (const f of allFeatures) {
                        const id = f.properties?.CVEGEO || String(colorIndex);
                        if (!colorsById.has(id)) {
                            colorsById.set(id, palette[colorIndex % palette.length]);
                            colorIndex++;
                        }
                    }

                    featureLayersById = new Map();
                    if (clipped.length > 0) {
                        const clippedCollection = T.featureCollection(clipped);
                        clippedLocalitiesLayer = L.geoJSON(clippedCollection, {
                            style: (feature) => {
                                const id = feature.properties?.CVEGEO;
                                const color = (id && colorsById.get(id)) || '#008000';
                                return { color, weight: 2, opacity: 0.9, fillColor: color, fillOpacity: 0.25 };
                            },
                            pointToLayer: (feature, latlng) => {
                                const id = feature.properties?.CVEGEO;
                                const color = (id && colorsById.get(id)) || '#008000';
                                return L.circleMarker(latlng, { radius: 6, fillColor: color, color: '#222', weight: 1, opacity: 1, fillOpacity: 0.9 });
                            },
                            onEachFeature: (feature, layer) => {
                                if (feature.properties) {
                                    const props = feature.properties;
                                    const nombre = props.NOM_LOC || props.NOMGEO || '—';
                                    let popupContent = `<strong>Localidad:</strong> ${nombre}<br>`;
                                    popupContent += `<strong>CVEGEO:</strong> ${props.CVEGEO || '—'}<br>`;
                                    if (props.POBTOTAL !== undefined) popupContent += `<strong>Pob. Total:</strong> ${formatNumber(props.POBTOTAL)}<br>`;
                                    if (props.PIHOGARES !== undefined) popupContent += `<strong>Pob. Indígena:</strong> ${formatNumber(props.PIHOGARES)} (${props.pPIHOGARES || 0}%)<br>`;
                                    if (props.POB_AFRO !== undefined) popupContent += `<strong>Pob. Afro:</strong> ${formatNumber(props.POB_AFRO)}<br>`;

                                    layer.bindPopup(popupContent);
                                    const id = props.CVEGEO;

                                    // Guardar el estilo original para el resaltado
                                    const originalStyle = {
                                        color: layer.options.color,
                                        weight: layer.options.weight,
                                        opacity: layer.options.opacity,
                                        fillColor: layer.options.fillColor,
                                        fillOpacity: layer.options.fillOpacity
                                    };
                                    layer.options.originalStyle = originalStyle;

                                    const ref = { layer };
                                    if (layer.getBounds) ref.bounds = layer.getBounds();
                                    else if (layer.getLatLng) ref.latlng = layer.getLatLng();
                                    if (id) featureLayersById.set(id, ref);
                                }
                                layer.on('click', () => {
                                    const id = feature.properties?.CVEGEO;
                                    if (id) setActiveListItem(id);
                                    const ref = featureLayersById.get(id);
                                    goToFeatureRef(ref);
                                    if (layer.openPopup) layer.openPopup();
                                });
                            }
                        }).addTo(map);
                    }

                    if (clippedPoints.length > 0) {
                        const pointsCollection = T.featureCollection(clippedPoints);
                        clippedPointsLayer = L.geoJSON(pointsCollection, {
                            pointToLayer: (feature, latlng) => {
                                const id = feature.properties?.CVEGEO;
                                const color = (id && colorsById.get(id)) || '#008000';
                                return L.circleMarker(latlng, { radius: 8, fillColor: color, color: '#222', weight: 1, opacity: 1, fillOpacity: 0.8 });
                            },
                            onEachFeature: (feature, layer) => {
                                if (feature.properties) {
                                    const props = feature.properties;
                                    const nombre = props.NOM_LOC || props.NOMGEO || '—';
                                    let popupContent = `<strong>Localidad (Punto):</strong> ${nombre}<br>`;
                                    popupContent += `<strong>CVEGEO:</strong> ${props.CVEGEO || '—'}<br>`;
                                    if (props.POBTOTAL !== undefined) popupContent += `<strong>Pob. Total:</strong> ${formatNumber(props.POBTOTAL)}<br>`;
                                    if (props.PIHOGARES !== undefined) popupContent += `<strong>Pob. Indígena:</strong> ${formatNumber(props.PIHOGARES)}<br>`;
                                    if (props.POB_AFRO !== undefined) popupContent += `<strong>Pob. Afro:</strong> ${formatNumber(props.POB_AFRO)}<br>`;

                                    layer.bindPopup(popupContent);
                                    const id = props.CVEGEO;

                                    // Guardar el estilo original para el resaltado
                                    const originalStyle = {
                                        radius: layer.options.radius,
                                        fillColor: layer.options.fillColor,
                                        color: layer.options.color,
                                        weight: layer.options.weight,
                                        opacity: layer.options.opacity,
                                        fillOpacity: layer.options.fillOpacity
                                    };
                                    layer.options.originalStyle = originalStyle;

                                    const ref = { layer, latlng: layer.getLatLng() };
                                    if (id) featureLayersById.set(id, ref);
                                }
                                layer.on('click', () => {
                                    const id = feature.properties?.CVEGEO;
                                    if (id) setActiveListItem(id);
                                    const ref = featureLayersById.get(id);
                                    goToFeatureRef(ref);
                                    if (layer.openPopup) layer.openPopup();
                                });
                            }
                        }).addTo(map);
                    }

                    const labels = [];
                    allFeatures.forEach(f => {
                        const id = f.properties?.CVEGEO;
                        const color = (id && colorsById.get(id)) || '#008000';
                        let position = null;
                        if (f.geometry.type === 'Point') {
                            const [lng, lat] = f.geometry.coordinates;
                            position = [lat, lng];
                        } else if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
                            try {
                                const centroid = T.centroid(f);
                                const [lng, lat] = centroid.geometry.coordinates;
                                position = [lat, lng];
                            } catch (e) { console.warn('No se pudo calcular centroide para feature:', id); }
                        }
                        if (position) {
                            const icon = L.divIcon({ className: 'cvegeo-label', html: `<span style="background:${color};color:#fff;padding:2px 4px;border-radius:3px;font-size:11px;">${id || ''}</span>` });
                            labels.push(L.marker(position, { icon }));
                        }
                    });

                    if (labels.length) labelLayer = L.layerGroup(labels).addTo(map);

                    const areaBounds = bufferLayer?.getBounds().isValid() ? bufferLayer.getBounds() : kmlLayer?.getBounds().isValid() ? kmlLayer.getBounds() : null;
                    const resultBounds = clippedLocalitiesLayer?.getBounds();
                    const pointsBounds = clippedPointsLayer?.getBounds();
                    let combinedBounds = areaBounds ? L.latLngBounds(areaBounds.getSouthWest(), areaBounds.getNorthEast()) : null;
                    if (combinedBounds) {
                        if (resultBounds?.isValid()) combinedBounds.extend(resultBounds);
                        if (pointsBounds?.isValid()) combinedBounds.extend(pointsBounds);
                    } else {
                        combinedBounds = resultBounds?.isValid() ? resultBounds : pointsBounds;
                    }

                    lastAreaBounds = combinedBounds;
                    if (resetViewBtn) resetViewBtn.disabled = !lastAreaBounds?.isValid();

                    setTimeout(() => {
                        map.invalidateSize();
                        if (lastAreaBounds?.isValid()) {
                            map.fitBounds(lastAreaBounds, { padding: [24, 24], maxZoom: 15, animate: true, duration: 0.6 });
                        }
                    }, 50);

                    displayCvegeoList(allFeatures, colorsById);
                    let message = `Se encontraron <strong>${clipped.length}</strong> localidades con polígonos`;
                    if (clippedPoints.length > 0) {
                        message += ` y <strong>${clippedPoints.length}</strong> más por coordenadas geográficas`;
                    }
                    message += ' dentro del área seleccionada.';
                    showModal({ title: 'Recorte completado', message, okText: 'Aceptar' });
                    updateProgress(100, 'Proceso completado.');

                    // Abrir modal de resultados
                    setTimeout(() => {
                        console.log('🔍 Intentando abrir modal...');
                        console.log('layersData:', layersData);
                        currentModalData = processDataForModal(layersData);
                        console.log('currentModalData procesado:', currentModalData);
                        if (currentModalData && Object.keys(currentModalData).length > 0) {
                            console.log('✅ Abriendo modal con', Object.keys(currentModalData).length, 'capas');
                            openResultsModal();
                        } else {
                            console.warn('❌ No hay datos para el modal');
                        }
                    }, 500);

                } else {
                    // Caso sin resultados
                    showModal({
                        title: 'Sin coincidencias',
                        message: 'No se encontraron localidades dentro del área especificada.',
                        okText: 'Cerrar'
                    });
                    cvegeoListDiv.innerHTML = '<p class="mb-0 text-muted">No se encontraron localidades dentro del área.</p>';

                    // Actualizar contadores
                    const badge = document.getElementById('foundCountBadge');
                    if (badge) badge.textContent = formatNumber(0);
                    const indBadge = document.getElementById('indigenasCountBadge');
                    const afroBadge = document.getElementById('afroCountBadge');
                    if (indBadge) indBadge.classList.add('tw-hidden');
                    if (afroBadge) afroBadge.classList.add('tw-hidden');
                    const totalFound = document.getElementById('totalFound');
                    if (totalFound) totalFound.textContent = formatNumber(0);
                    const currentCriteria = document.getElementById('currentCriteria');
                    if (currentCriteria) {
                        currentCriteria.textContent = areaTypeSelect.options[areaTypeSelect.selectedIndex].text;
                    }

                    updateProgress(100, 'Sin coincidencias encontradas.');
                    // Encuadrar el área analizada (buffer o KML) aunque no haya resultados
                    const areaOnly = (bufferLayer && bufferLayer.getBounds && bufferLayer.getBounds().isValid())
                        ? bufferLayer.getBounds()
                        : (kmlLayer && kmlLayer.getBounds && kmlLayer.getBounds().isValid())
                            ? kmlLayer.getBounds()
                            : null;
                    lastAreaBounds = areaOnly;
                    if (resetViewBtn) resetViewBtn.disabled = !lastAreaBounds || !lastAreaBounds.isValid();
                    setTimeout(() => {
                        map.invalidateSize();
                        if (lastAreaBounds && lastAreaBounds.isValid()) {
                            map.fitBounds(lastAreaBounds, { padding: [24, 24], maxZoom: 15, animate: true, duration: 0.5 });
                        }
                    }, 50);
                }

            } catch (err) {
                console.error('Error durante el recorte geoespacial:', err);
                showModal({
                    title: 'Error durante el recorte',
                    message: 'Ocurrió un error durante el procesamiento geoespacial. Revisa la consola para más detalles.',
                    okText: 'Cerrar'
                });
            } finally {
                // Siempre ocultar preloader al finalizar
                hidePreloader();
            }
        }

        // ====================================================================
        // FUNCIONES DE REPORTES Y GRÁFICOS
        // ====================================================================

        /**
         * Genera gráficos con análisis de datos
         */
        function generateCharts(layersData) {
            generateLayerChart(layersData);
            generatePopulationChart(layersData);
        }

        /**
         * Genera gráfico de barras con la distribución de elementos por capa
         */
        function generateLayerChart(layersData) {
            const chartData = [];
            const layerColors = {
                localidades: '#008000',
            };

            const layerNames = {
                localidades: 'Localidades',
            };

            Object.entries(layersData).forEach(([layerName, data]) => {
                if (data.features && data.features.length > 0) {
                    const count = data.features.length;

                    chartData.push({
                        name: layerNames[layerName] || layerName,
                        y: count,
                        color: layerColors[layerName] || '#666666'
                    });
                }
            });

            Highcharts.chart('layerChart', {
                chart: {
                    type: 'bar',
                    backgroundColor: 'transparent',
                    style: {
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }
                },
                accessibility: {
                    enabled: false
                },
                title: {
                    text: null
                },
                xAxis: {
                    categories: chartData.map(item => item.name),
                    labels: {
                        style: {
                            color: '#333',
                            fontSize: '11px'
                        }
                    }
                },
                yAxis: {
                    title: {
                        text: 'Número de Elementos',
                        style: {
                            color: '#7C1946',
                            fontWeight: 'bold'
                        }
                    },
                    labels: {
                        style: {
                            color: '#666'
                        }
                    }
                },
                legend: {
                    enabled: false
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    borderColor: '#7C1946',
                    borderRadius: 8,
                    shadow: true,
                    style: {
                        color: '#333'
                    },
                    formatter: function () {
                        return `<b>${this.x}</b><br/>Elementos: <b>${this.y.toLocaleString('es-MX')}</b>`;
                    }
                },
                plotOptions: {
                    bar: {
                        dataLabels: {
                            enabled: true,
                            color: '#333',
                            style: {
                                fontSize: '11px',
                                fontWeight: 'bold'
                            },
                            formatter: function () {
                                return this.y.toLocaleString('es-MX');
                            }
                        }
                    }
                },
                series: [{
                    name: 'Elementos',
                    data: chartData,
                    colorByPoint: true
                }],
                credits: {
                    enabled: false
                },
                exporting: {
                    enabled: true,
                    buttons: {
                        contextButton: {
                            menuItems: ['viewFullscreen', 'printChart', 'downloadPNG', 'downloadJPEG', 'downloadPDF', 'downloadSVG']
                        }
                    }
                }
            });
        }

        /**
         * Genera gráfico de barras con top 10 localidades por población
         */
        function generatePopulationChart(layersData) {
            if (!layersData.localidades || !layersData.localidades.features) {
                return;
            }

            const populationData = layersData.localidades.features
                .filter(f => f.properties.POBTOT && f.properties.POBTOT > 0)
                .sort((a, b) => (b.properties.POBTOT || 0) - (a.properties.POBTOT || 0))
                .slice(0, 10)
                .map(f => ({
                    name: f.properties.NOM_LOC || f.properties.NOMGEO || 'Sin nombre',
                    y: f.properties.POBTOT,
                    color: '#7C1946'
                }));

            if (populationData.length === 0) {
                return;
            }

            Highcharts.chart('populationChart', {
                chart: {
                    type: 'column',
                    backgroundColor: 'transparent',
                    style: {
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }
                },
                accessibility: {
                    enabled: false
                },
                title: {
                    text: null
                },
                xAxis: {
                    categories: populationData.map(item => item.name.length > 15 ?
                        item.name.substring(0, 15) + '...' : item.name),
                    labels: {
                        rotation: -45,
                        style: {
                            color: '#333',
                            fontSize: '10px'
                        }
                    }
                },
                yAxis: {
                    title: {
                        text: 'Población Total',
                        style: {
                            color: '#7C1946',
                            fontWeight: 'bold'
                        }
                    },
                    labels: {
                        style: {
                            color: '#666'
                        },
                        formatter: function () {
                            return (this.value / 1000).toFixed(0) + 'k';
                        }
                    }
                },
                legend: {
                    enabled: false
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    borderColor: '#7C1946',
                    borderRadius: 8,
                    shadow: true,
                    style: {
                        color: '#333'
                    },
                    formatter: function () {
                        return `<b>${this.x}</b><br/>Población: <b>${this.y.toLocaleString('es-MX')}</b>`;
                    }
                },
                plotOptions: {
                    column: {
                        dataLabels: {
                            enabled: true,
                            color: '#333',
                            style: {
                                fontSize: '9px',
                                fontWeight: 'bold'
                            },
                            formatter: function () {
                                return (this.y / 1000).toFixed(0) + 'k';
                            },
                            rotation: -90,
                            y: -20
                        }
                    }
                },
                series: [{
                    name: 'Población',
                    data: populationData,
                    color: '#7C1946'
                }],
                credits: {
                    enabled: false
                },
                exporting: {
                    enabled: true,
                    buttons: {
                        contextButton: {
                            menuItems: ['viewFullscreen', 'printChart', 'downloadPNG', 'downloadJPEG', 'downloadPDF', 'downloadSVG']
                        }
                    }
                }
            });
        }

        function generateExcelReport() {
            const wb = XLSX.utils.book_new();

            // Hoja de Localidades
            if (layersData.localidades && layersData.localidades.features.length > 0) {
                const localidadesData = layersData.localidades.features.map(f => {
                    const p = f.properties;
                    return {
                        'CVE_ENT': p.CVE_ENT || p.cve_ent,
                        'CVE_MUN': p.CVE_MUN || p.cve_mun,
                        'CVE_LOC': p.CVE_LOC || p.cve_loc,
                        'CVEGEO': p.CVEGEO || p.cvegeo,
                        'NOMBRE': p.NOMGEO || p.NOM_LOC || p.LOCALIDAD,
                        'AMBITO': p.AMBITO || '-',
                        'POB_TOTAL': p.POBTOTAL || p.POBTOT || 0,
                        'POB_INDIGENA': p.PIHOGARES || 0,
                        '%_POB_INDIGENA': p.pPIHOGARES || 0,
                        'TIPO_LOC_PI': p.TIPOLOC_PI || '-',
                        'POB_AFRO': p.POB_AFRO || 0,
                        '%_POB_AFRO': p.pPOB_AFRO || 0,
                        'TIPO_LOC_AFRO': p.TIPOLOC_AF || '-',
                        'ORIGEN': p.origen || '-'
                    };
                });
                const ws = XLSX.utils.json_to_sheet(localidadesData);
                XLSX.utils.book_append_sheet(wb, ws, "Análisis Localidades");
            }

            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });

            function s2ab(s) {
                const buf = new ArrayBuffer(s.length);
                const view = new Uint8Array(buf);
                for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
                return buf;
            }

            saveAs(new Blob([s2ab(wbout)], { type: "application/octet-stream" }), 'Reporte_Analisis_Geoespacial.xlsx');
        }

        // ====================================================================
        // CONFIGURACIÓN DE EVENTOS DE INTERFAZ
        // ====================================================================
        const downloadReportBtn = document.getElementById('downloadReportBtn');
        if (downloadReportBtn) {
            downloadReportBtn.addEventListener('click', () => {
                if (totalElements > 0) {
                    generateExcelReport();
                } else {
                    showAlert('No hay datos para exportar. Realiza un recorte primero.', 'warning');
                }
            });
        }

        /**
         * Configuración de todos los event listeners para la interfaz de usuario
         * Maneja la interactividad del formulario y controles del mapa
         */

        // Validación en tiempo real del archivo seleccionado
        if (kmlFileInput) {
            kmlFileInput.addEventListener('change', (e) => {
                const hasFiles = e.target.files.length > 0;
                // uploadKmlBtn.disabled = !hasFiles;

                if (hasFiles) {
                    const file = e.target.files[0];
                    // Procesar automáticamente al seleccionar
                    processKmlFile(file);

                    // Mostrar información del archivo seleccionado
                    const fileInfo = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
                    // uploadKmlBtn.innerHTML = `<span class="material-symbols-outlined tw-text-lg">visibility</span>Visualizar: ${fileInfo}`;
                } else {
                    // uploadKmlBtn.innerHTML = `<span class="material-symbols-outlined tw-text-lg">visibility</span>Visualizar KML`;
                }
            });
        }

        // Procesar archivo KML seleccionado con validaciones mejoradas
        /*
        if (uploadKmlBtn) {
            uploadKmlBtn.addEventListener('click', () => {
                const file = kmlFileInput.files[0];
                if (file) {
                    // Deshabilitar temporalmente para evitar clicks múltiples
                    uploadKmlBtn.disabled = true;
                    uploadKmlBtn.innerHTML = `<span class="material-symbols-outlined tw-text-lg tw-animate-spin">hourglass_empty</span>Procesando...`;

                    // Procesar con delay para mostrar feedback visual
                    setTimeout(() => {
                        processKmlFile(file);
                        // Restaurar estado original
                        uploadKmlBtn.disabled = false;
                        uploadKmlBtn.innerHTML = `<span class="material-symbols-outlined tw-text-lg">visibility</span>Visualizar KML`;
                        // Limpiar selección para permitir re-cargar el mismo archivo
                        kmlFileInput.value = '';
                    }, 100);
                } else {
                    showAlert('Por favor, selecciona un archivo KML válido antes de continuar.', 'info');
                }
            });
        }
        */

        // Ejecutar recorte de localidades con protección contra clicks múltiples y validaciones
        if (performClipBtn) {
            performClipBtn.addEventListener('click', async () => {
                // Validaciones previas
                if (!kmlGeoJson) {
                    showModal({ title: 'Recorte de Localidades', message: 'Debes cargar un archivo KML válido antes de realizar el recorte.', okText: 'Entendido' });
                    return;
                }

                // Confirmación para procesos largos con modal
                const selectedAreaType = areaTypeSelect.options[areaTypeSelect.selectedIndex].text;
                const proceed = await showConfirm({
                    title: window.location.host || 'Confirmación',
                    message: `¿Deseas proceder con el análisis del tipo "${selectedAreaType}"?<br><br>` +
                        'Este proceso puede tomar varios segundos dependiendo del tamaño del área.',
                    okText: 'Aceptar',
                    cancelText: 'Cancelar'
                });

                if (!proceed) return;

                // Prevenir ejecuciones simultáneas del proceso intensivo
                performClipBtn.disabled = true;
                performClipBtn.innerHTML = `<span class="material-symbols-outlined tw-text-lg tw-animate-spin">hourglass_empty</span>Procesando...`;

                Promise.resolve()
                    .then(() => performClipping())
                    .catch(error => {
                        console.error('Error en performClipping:', error);
                        showModal({ title: 'Error', message: 'Ocurrió un error inesperado durante el procesamiento.', okText: 'Cerrar' });
                    })
                    .finally(() => {
                        // Re-habilitar solo si hay KML cargado
                        performClipBtn.disabled = !kmlGeoJson;
                        performClipBtn.innerHTML = `<span class="material-symbols-outlined tw-text-lg">play_arrow</span>Ejecutar Análisis`;
                    });
            });
        }

        // Restaurar vista del área de resultados con validaciones
        if (resetViewBtn) {
            resetViewBtn.addEventListener('click', () => {
                if (lastAreaBounds && lastAreaBounds.isValid()) {
                    const center = lastAreaBounds.getCenter();
                    const z = Math.min(map.getBoundsZoom(lastAreaBounds, true), 15);
                    map.setView(center, z, { animate: true, duration: 0.5 });
                    showAlert('Vista restaurada al área de resultados.', 'info', 2000);
                } else {
                    showAlert('No hay un área válida para restaurar la vista. Realiza primero un recorte.', 'warning');
                }
            });
        }

        // Centrar en el KML cargado
        if (centerKmlBtn) {
            centerKmlBtn.addEventListener('click', () => {
                if (kmlLayer && kmlLayer.getBounds && kmlLayer.getBounds().isValid()) {
                    const b = kmlLayer.getBounds();
                    map.fitBounds(b, { padding: [24, 24], maxZoom: 15, animate: true, duration: 0.5 });
                    showAlert('Vista encuadrada al KML cargado.', 'info', 1500);
                } else {
                    showModal({ title: 'Sin KML', message: 'Carga un KML válido para centrar el mapa.', okText: 'Entendido' });
                }
            });
        }

        // Limpiar todas las capas y resetear aplicación con confirmación modal
        if (clearMapBtn) {
            clearMapBtn.addEventListener('click', async () => {
                const hasData = kmlLayer || clippedLocalitiesLayer || bufferLayer;

                if (hasData) {
                    const proceed = await showConfirm({
                        title: window.location.host || 'Confirmación',
                        message: '¿Estás seguro de que deseas limpiar todo el mapa?<br><br>' +
                            'Esta acción eliminará todas las capas y datos cargados.',
                        okText: 'Aceptar',
                        cancelText: 'Cancelar'
                    });
                    if (!proceed) return;
                }

                clearAllLayers();
                showModal({
                    title: 'Mapa limpio',
                    message: 'Se han eliminado todas las capas. Puedes cargar un nuevo archivo KML.',
                    okText: 'Entendido'
                });

                // Resetear formulario
                kmlFileInput.value = '';
                // uploadKmlBtn.innerHTML = `<span class="material-symbols-outlined tw-text-lg">visibility</span>Visualizar KML`;
            });
        }

        // Inicializar carga de localidades (lazy loading)
        loadLocalitiesData();

    } catch (err) {
        console.error('Error crítico inicializando la aplicación:', err);
        showAlert(
            'Ocurrió un error crítico al inicializar la aplicación. Recarga la página e intenta nuevamente.',
            'danger',
            10000
        );
        hidePreloader();
    }
}

// ============================================================================
// FUNCIONES DEL MODAL DE RESULTADOS
// ============================================================================

/**
 * Abre el modal de resultados con los datos del análisis
 */
function openResultsModal() {
    console.log('🔍 openResultsModal() llamado');
    console.log('layersData:', layersData);

    // Procesar datos para el panel flotante
    currentModalData = processDataForModal(layersData);
    console.log('currentModalData procesado:', currentModalData);

    // Actualizar y mostrar panel flotante
    updateFloatingPanel(currentModalData);

    // Mostrar el panel flotante
    const panel = document.getElementById('floatingResultsPanel');
    const btn = document.getElementById('floatingResultsBtn');
    console.log('Panel encontrado:', !!panel, 'Botón encontrado:', !!btn);

    if (panel && btn) {
        panel.classList.add('active');
        btn.classList.remove('tw-hidden');
        console.log('✅ Panel y botón mostrados');
    } else {
        console.error('❌ No se encontró el panel o botón flotante');
    }

    // Resetear paginación
    currentPage = 1;
}

/**
 * Cierra el modal/panel de resultados
 */
function closeResultsModal() {
    const panel = document.getElementById('floatingResultsPanel');
    if (panel) {
        panel.classList.remove('active');
    }
    currentActiveFilter = null;
    currentPage = 1;
}

/**
 * Procesa los datos de layersData para el formato del modal
 */
function processDataForModal(layersDataObj) {
    console.log('📊 processDataForModal recibió:', layersDataObj);
    if (!layersDataObj) {
        console.warn('⚠️ layersDataObj es null/undefined');
        return {};
    }

    const processed = {};

    Object.entries(layersDataObj).forEach(([key, data]) => {
        console.log(`Procesando capa "${key}":`, data);
        if (data.features && data.features.length > 0) {
            const config = LAYER_CONFIG[key];
            console.log(`Config para "${key}":`, config);
            if (config) {
                processed[key] = {
                    title: config.name,
                    icon: config.icon,
                    color: config.color,
                    features: data.features
                };
                console.log(`✅ Capa "${key}" procesada:`, processed[key].features.length, 'features');
            } else {
                console.warn(`❌ No se encontró config para capa "${key}"`);
            }
        } else {
            console.warn(`⚠️ Capa "${key}" sin features o vacía`);
        }
    });

    console.log('📦 Resultado final de processDataForModal:', processed);
    return processed;
}

/**
 * Renderiza el contenido completo del modal
 */
function renderModalContent() {
    if (!currentModalData) return;

    // Contar total de elementos
    const totalElements = Object.values(currentModalData).reduce((sum, layer) => sum + layer.features.length, 0);
    const countEl = document.getElementById('totalElementsCount');
    if (countEl) {
        countEl.textContent = `${totalElements.toLocaleString('es-MX')} elementos`;
    }

    // Renderizar filtros
    renderLayerFilters();

    // Mostrar la primera capa por defecto
    const firstLayerKey = Object.keys(currentModalData)[0];
    if (firstLayerKey) {
        currentActiveFilter = firstLayerKey;
        showLayerResults(firstLayerKey);
    }
}

/**
 * Renderiza los botones de filtro por capa
 */
function renderLayerFilters() {
    const container = document.getElementById('layerFilters');
    if (!container) return;

    container.innerHTML = '';

    Object.entries(currentModalData).forEach(([layerKey, layerData]) => {
        const button = document.createElement('button');

        const isActive = currentActiveFilter === layerKey;

        button.style.cssText = `
            flex-shrink: 0;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.625rem 1rem;
            border-radius: 9999px;
            font-weight: 700;
            font-size: 0.875rem;
            transition: all 0.2s;
            cursor: pointer;
            border: 2px solid ${isActive ? 'rgba(128, 0, 32, 0.2)' : 'transparent'};
            background: ${isActive ? 'rgba(128, 0, 32, 0.1)' : '#f1f5f9'};
            color: ${isActive ? '#800020' : '#64748b'};
        `;

        button.innerHTML = `
            <span class="material-symbols-outlined" style="font-size: 1.125rem;">${layerData.icon}</span>
            <span>${layerData.title}</span>
            <span style="background: #e2e8f0; padding: 0.125rem 0.5rem; border-radius: 0.5rem; font-size: 0.75rem;">${layerData.features.length}</span>
        `;

        button.addEventListener('click', () => {
            currentActiveFilter = layerKey;
            currentPage = 1; // Reset pagination
            renderLayerFilters();
            showLayerResults(layerKey);
        });

        container.appendChild(button);
    });
}

/**
 * Muestra los resultados de una capa específica
 */
function showLayerResults(layerKey) {
    const container = document.getElementById('layerResultsContainer');
    if (!container || !currentModalData[layerKey]) return;

    const layerData = currentModalData[layerKey];

    // Header de la sección
    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h2 style="color: #1e293b; font-weight: 800; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; margin: 0;">
                ${layerData.title} (${layerData.features.length.toLocaleString('es-MX')})
            </h2>
        </div>
    `;

    // Generar tabla
    html += renderTableForLayer(layerKey, layerData);

    container.innerHTML = html;
}

/**
 * Renderiza una tabla paginada para una capa
 */
function renderTableForLayer(layerKey, layerData) {
    const features = layerData.features;
    if (features.length === 0) {
        return '<p style="color: #94a3b8; font-size: 0.875rem;">No hay datos disponibles.</p>';
    }

    // Calcular paginación
    const totalItems = features.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
    const paginatedFeatures = features.slice(startIndex, endIndex);

    // Obtener columnas del primer feature
    const firstProps = features[0].properties;
    const columns = Object.keys(firstProps).slice(0, 10); // Máximo 10 columnas

    let html = `
        <div style="overflow-x: auto; border-radius: 0.75rem; border: 1px solid #f1f5f9; margin-bottom: 1rem;">
            <table style="width: 100%; text-align: left; font-size: 0.75rem; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f8fafc; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
    `;

    // Headers
    columns.forEach(col => {
        html += `<th style="padding: 0.75rem 1rem; white-space: nowrap;">${col}</th>`;
    });

    html += `
                    </tr>
                </thead>
                <tbody>
    `;

    // Rows
    paginatedFeatures.forEach((feature, index) => {
        const globalIndex = startIndex + index;
        const props = feature.properties;
        const rowBg = index % 2 === 0 ? '#ffffff' : '#f8fafc';

        html += `
            <tr onclick="zoomToFeatureFromModal(currentModalData['${layerKey}'].features[${globalIndex}], '${layerKey}')" 
                style="background: ${rowBg}; color: #475569; cursor: pointer; transition: all 0.2s;"
                onmouseover="this.style.background='#fdf2f4'; this.style.borderLeft='4px solid #800020'; this.style.paddingLeft='12px';"
                onmouseout="this.style.background='${rowBg}'; this.style.borderLeft='none'; this.style.paddingLeft='16px';">
        `;

        columns.forEach(col => {
            let value = props[col];

            // Formatear números
            if (typeof value === 'number') {
                value = value.toLocaleString('es-MX');
            } else if (value === null || value === undefined) {
                value = '-';
            }

            html += `<td style="padding: 1rem; white-space: nowrap;">${value}</td>`;
        });

        html += `</tr>`;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    // Controles de paginación
    if (totalPages > 1) {
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; padding: 0.5rem 0;">
                <button onclick="changePage(-1)" 
                    ${currentPage === 1 ? 'disabled' : ''}
                    style="padding: 0.5rem 1rem; background: ${currentPage === 1 ? '#f1f5f9' : '#800020'}; color: ${currentPage === 1 ? '#94a3b8' : 'white'}; border: none; border-radius: 0.5rem; font-weight: 600; font-size: 0.75rem; cursor: ${currentPage === 1 ? 'not-allowed' : 'pointer'};">
                    ← Anterior
                </button>
                
                <span style="color: #64748b; font-size: 0.875rem; font-weight: 600;">
                    Mostrando ${(startIndex + 1).toLocaleString('es-MX')}-${endIndex.toLocaleString('es-MX')} de ${totalItems.toLocaleString('es-MX')} resultados (Página ${currentPage} de ${totalPages})
                </span>
                
                <button onclick="changePage(1)" 
                    ${currentPage === totalPages ? 'disabled' : ''}
                    style="padding: 0.5rem 1rem; background: ${currentPage === totalPages ? '#f1f5f9' : '#800020'}; color: ${currentPage === totalPages ? '#94a3b8' : 'white'}; border: none; border-radius: 0.5rem; font-weight: 600; font-size: 0.75rem; cursor: ${currentPage === totalPages ? 'not-allowed' : 'pointer'};">
                    Siguiente →
                </button>
            </div>
        `;
    }

    return html;
}

/**
 * Cambia la página actual de la tabla
 */
function changePage(direction) {
    if (!currentActiveFilter || !currentModalData[currentActiveFilter]) return;

    const layerData = currentModalData[currentActiveFilter];
    const totalPages = Math.ceil(layerData.features.length / ITEMS_PER_PAGE);

    currentPage += direction;

    // Limitar entre 1 y totalPages
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    // Re-renderizar tabla
    showLayerResults(currentActiveFilter);
}

/**
 * Hace zoom y centra el mapa en un feature clickeado
 */
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
        const geoJsonLayer = L.geoJSON(feature);
        center = geoJsonLayer.getBounds().getCenter();
    } else {
        showAlert('Tipo de geometría no soportado', 'warning');
        return;
    }

    // Centrar el mapa
    map.setView(center, 14, {
        animate: true,
        duration: 1
    });

    // Crear marker temporal animado
    const marker = L.circleMarker(center, {
        radius: 12,
        fillColor: '#800020',
        color: '#fff',
        weight: 3,
        fillOpacity: 0.8
    }).addTo(map);

    // Animación pulse
    let pulseCount = 0;
    const pulseInterval = setInterval(() => {
        const radius = 12 + (pulseCount % 2) * 6;
        marker.setRadius(radius);
        pulseCount++;

        if (pulseCount > 6) {
            clearInterval(pulseInterval);
            map.removeLayer(marker);
        }
    }, 250);
}

/**
 * Descarga los resultados del análisis como archivo Excel
 */
function downloadModalExcel() {
    if (!currentModalData || Object.keys(currentModalData).length === 0) {
        showAlert('No hay datos para exportar', 'warning');
        return;
    }

    try {
        const wb = XLSX.utils.book_new();

        // ===== HOJA 1: Info General del KML =====
        const infoData = [
            ['INFORMACIÓN GENERAL DEL ANÁLISIS'],
            [],
            ['Tipo de Análisis', 'Análisis de Localidades'],
            ['Versión', 'V1 - Análisis Manual por Capas'],
            ['Nombre del Archivo', kmlMetrics.fileName || 'N/A'],
            ['Fecha de Carga', kmlMetrics.uploadDate || new Date().toLocaleDateString('es-MX')],
            ['Fecha de Exportación', new Date().toLocaleString('es-MX')],
            [],
            ['GEOMETRÍA DEL POLÍGONO'],
            [],
            ['Tipo de Geometría', kmlMetrics.geometryType || 'N/A'],
            ['Área Total (km²)', kmlMetrics.area || 'N/A'],
            ['Perímetro (km)', kmlMetrics.perimeter || 'N/A'],
            ['Número de Vértices', kmlMetrics.vertexCount || 'N/A'],
            ['Centroide (Lat, Lng)', kmlMetrics.centroid ? `${kmlMetrics.centroid.lat.toFixed(6)}, ${kmlMetrics.centroid.lng.toFixed(6)}` : 'N/A'],
            ['Límites Norte', kmlMetrics.bounds?.north?.toFixed(6) || 'N/A'],
            ['Límites Sur', kmlMetrics.bounds?.south?.toFixed(6) || 'N/A'],
            ['Límites Este', kmlMetrics.bounds?.east?.toFixed(6) || 'N/A'],
            ['Límites Oeste', kmlMetrics.bounds?.west?.toFixed(6) || 'N/A'],
            [],
            ['RESUMEN DE CAPAS ANALIZADAS'],
            [],
            ['Total de Capas', Object.keys(currentModalData).length],
            ['Total de Elementos', Object.values(currentModalData).reduce((sum, layer) => sum + layer.features.length, 0)]
        ];

        const ws1 = XLSX.utils.aoa_to_sheet(infoData);

        // Estilo para el header
        if (ws1['A1']) {
            ws1['A1'].s = {
                font: { bold: true, sz: 14, color: { rgb: "800020" } },
                alignment: { horizontal: "center" }
            };
        }

        XLSX.utils.book_append_sheet(wb, ws1, '00_Info_General');

        // ===== HOJAS 2+: Una hoja por cada capa =====
        Object.entries(currentModalData).forEach(([layerKey, layerData]) => {
            const features = layerData.features;
            if (features.length === 0) return;

            // Obtener todas las propiedades únicas
            const allProps = new Set();
            features.forEach(f => {
                Object.keys(f.properties).forEach(prop => allProps.add(prop));
            });
            const columns = Array.from(allProps);

            // Crear array de datos
            const sheetData = [columns]; // Headers

            features.forEach(feature => {
                const row = columns.map(col => {
                    const value = feature.properties[col];
                    return value !== null && value !== undefined ? value : '';
                });
                sheetData.push(row);
            });

            const ws = XLSX.utils.aoa_to_sheet(sheetData);

            // Estilo para headers
            columns.forEach((col, index) => {
                const cellAddress = XLSX.utils.encode_cell({ r: 0, c: index });
                if (!ws[cellAddress]) return;
                ws[cellAddress].s = {
                    font: { bold: true, color: { rgb: "FFFFFF" } },
                    fill: { fgColor: { rgb: "800020" } },
                    alignment: { horizontal: "center" }
                };
            });

            // Nombre de la hoja (máximo 31 caracteres)
            let sheetName = layerData.title.substring(0, 30);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });

        // Descargar archivo
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
        const fileName = `Analisis_Resultados_V1_${dateStr}_${timeStr}.xlsx`;

        XLSX.writeFile(wb, fileName);
        showAlert('Archivo Excel descargado exitosamente', 'success');

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
        const legend = document.getElementById('map-legend');

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
            html2canvas(mapContainer, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
                imageTimeout: 0,
                onclone: function (clonedDoc) {
                    const clonedMap = clonedDoc.getElementById('map');
                    if (clonedMap) {
                        clonedMap.style.width = mapContainer.offsetWidth + 'px';
                        clonedMap.style.height = mapContainer.offsetHeight + 'px';
                    }
                }
            }).then(function (canvas) {
                // Crear canvas compuesto
                const finalCanvas = document.createElement('canvas');
                finalCanvas.width = canvas.width;
                finalCanvas.height = canvas.height;
                const ctx = finalCanvas.getContext('2d');

                // Dibujar mapa base
                ctx.drawImage(canvas, 0, 0);

                // Dibujar leyenda (si está visible)
                if (legend && !legend.classList.contains('hidden')) {
                    const legendItems = legend.querySelectorAll('.legend-item');
                    if (legendItems.length > 0) {
                        const scale = 2;
                        const legendPadding = 15 * scale;
                        const legendItemHeight = 28 * scale;
                        const legendWidth = 250 * scale;
                        const legendHeight = (legendItems.length * legendItemHeight) + (legendPadding * 2) + (30 * scale);

                        const legendX = canvas.width - legendWidth - (20 * scale);
                        const legendY = 20 * scale;

                        // Fondo de leyenda
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
                        ctx.shadowBlur = 10 * scale;
                        ctx.shadowOffsetY = 2 * scale;
                        ctx.beginPath();
                        ctx.roundRect(legendX, legendY, legendWidth, legendHeight, 12 * scale);
                        ctx.fill();
                        ctx.shadowColor = 'transparent';
                        ctx.shadowBlur = 0;

                        // Título "CAPAS"
                        ctx.fillStyle = '#1e293b';
                        ctx.font = `bold ${14 * scale}px Inter, sans-serif`;
                        ctx.fillText('CAPAS', legendX + legendPadding, legendY + legendPadding + (14 * scale));

                        // Items de leyenda
                        let yOffset = legendY + legendPadding + (35 * scale);
                        legendItems.forEach((item) => {
                            const colorEl = item.querySelector('.legend-color');
                            const labelEl = item.querySelector('.legend-label');
                            const countEl = item.querySelector('.legend-count');

                            if (colorEl && labelEl) {
                                const color = colorEl.style.background || colorEl.style.backgroundColor;
                                const label = labelEl.textContent;
                                const count = countEl ? countEl.textContent : '';

                                // Círculo de color
                                ctx.fillStyle = color;
                                ctx.beginPath();
                                ctx.arc(legendX + legendPadding + (8 * scale), yOffset, 6 * scale, 0, Math.PI * 2);
                                ctx.fill();

                                // Etiqueta
                                ctx.fillStyle = '#475569';
                                ctx.font = `${12 * scale}px Inter, sans-serif`;
                                ctx.fillText(label, legendX + legendPadding + (24 * scale), yOffset + (4 * scale));

                                // Contador
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

                // Dibujar cuadro de metadatos
                const scale = 2;
                const metaWidth = 400 * scale;
                const metaHeight = 90 * scale;
                const metaX = 20 * scale;
                const metaY = canvas.height - metaHeight - (20 * scale);
                const metaPadding = 16 * scale;

                // Fondo
                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
                ctx.shadowBlur = 10 * scale;
                ctx.shadowOffsetY = 2 * scale;
                ctx.beginPath();
                ctx.roundRect(metaX, metaY, metaWidth, metaHeight, 12 * scale);
                ctx.fill();
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;

                // Título
                ctx.fillStyle = '#800020';
                ctx.font = `bold ${16 * scale}px Inter, sans-serif`;
                ctx.fillText('ANÁLISIS DE IMPACTO - V1', metaX + metaPadding, metaY + metaPadding + (14 * scale));

                // Info del archivo
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

                // Descargar
                finalCanvas.toBlob(function (blob) {
                    const now = new Date();
                    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
                    const fileName = `Mapa_Analisis_V1_${dateStr}_${timeStr}.png`;

                    const link = document.createElement('a');
                    link.download = fileName;
                    link.href = URL.createObjectURL(blob);
                    link.click();
                    URL.revokeObjectURL(link.href);

                    // Restaurar vista
                    map.setView(originalCenter, originalZoom, { animate: false });
                    if (legendWasHidden && legend) legend.classList.add('hidden');

                    hidePreloader();
                    showAlert('Mapa exportado con leyenda en alta resolución', 'success');
                }, 'image/png', 1.0);

            }).catch(function (error) {
                console.error('Error:', error);
                map.setView(originalCenter, originalZoom, { animate: false });
                if (legendWasHidden && legend) legend.classList.add('hidden');
                hidePreloader();
                showAlert('Error al exportar el mapa', 'danger');
            });
        };

        // Centrar KML antes de capturar
        if (kmlLayer && kmlLayer.getBounds) {
            const bounds = kmlLayer.getBounds();
            if (bounds && bounds.isValid()) {
                const onMoveEnd = () => {
                    map.off('moveend', onMoveEnd);
                    setTimeout(captureMap, 800);
                };
                map.once('moveend', onMoveEnd);
                map.fitBounds(bounds, { padding: [50, 50], animate: false });
            } else {
                setTimeout(captureMap, 800);
            }
        } else {
            setTimeout(captureMap, 800);
        }

    } catch (error) {
        console.error('Error:', error);
        hidePreloader();
        showAlert('Error al exportar el mapa', 'danger');
    }
}

// ============================================================================
// INICIALIZACIÓN DE LA APLICACIÓN
// ============================================================================

/**
 * Detectar el estado del DOM e inicializar cuando esté listo
 * Garantiza que todos los elementos estén disponibles antes de la configuración
 */
if (document.readyState === 'loading') {
    // DOM aún se está cargando
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    // DOM ya está listo, inicializar inmediatamente
    initApp();
}

// ============================================================================
// FUNCIONES DEL PANEL FLOTANTE
// ============================================================================

/**
 * Toggle del panel flotante de resultados
 */
function toggleFloatingResults() {
    const panel = document.getElementById('floatingResultsPanel');
    const btn = document.getElementById('floatingResultsBtn');

    if (panel.classList.contains('active')) {
        panel.classList.remove('active');
        if (btn) btn.style.display = 'flex';
    } else {
        panel.classList.add('active');
        if (btn) btn.style.display = 'none';
    }
}

/**
 * Actualiza el resumen del panel flotante
 */
function updateFloatingPanel(data) {
    const summaryEl = document.getElementById('floatingResultsSummary');
    const badgeEl = document.getElementById('totalFoundBadge');
    const countBadge = document.getElementById('resultsBadgeCount');
    const btnEl = document.getElementById('floatingResultsBtn');

    if (!data || Object.keys(data).length === 0) {
        if (summaryEl) summaryEl.innerHTML = '<p class="tw-text-xs tw-text-gray-500 tw-text-center">No hay resultados disponibles.</p>';
        if (badgeEl) badgeEl.textContent = '0 elementos';
        if (countBadge) countBadge.textContent = '0';
        if (btnEl) btnEl.style.display = 'none';
        return;
    }

    const totalElements = Object.values(data).reduce((sum, layer) => sum + layer.features.length, 0);

    if (badgeEl) badgeEl.textContent = `${totalElements.toLocaleString('es-MX')} elementos`;
    if (countBadge) countBadge.textContent = totalElements > 99 ? '99+' : totalElements;
    if (btnEl) btnEl.style.display = 'flex';

    if (summaryEl) {
        let html = '';
        Object.entries(data).forEach(([key, layer]) => {
            html += `
                <div class="tw-flex tw-items-center tw-justify-between tw-p-2 tw-bg-white tw-rounded-lg tw-border tw-border-gray-200">
                    <div class="tw-flex tw-items-center tw-gap-2">
                        <span class="material-symbols-outlined tw-text-sm" style="color: ${layer.color || '#666'}">${layer.icon || 'layers'}</span>
                        <span class="tw-text-xs tw-font-semibold tw-text-gray-700">${layer.title}</span>
                    </div>
                    <span class="tw-text-xs tw-font-bold tw-text-gray-900">${layer.features.length.toLocaleString('es-MX')}</span>
                </div>
            `;
        });
        summaryEl.innerHTML = html;
    }
}

// ============================================================================
// FAILSAFES Y CLEANUP
// ============================================================================

/**
 * Medidas de seguridad para garantizar que el preloader no bloquee la interfaz
 * Estos eventos actúan como respaldo en caso de errores en el flujo normal
 */

// Ocultar preloader cuando termine de cargar toda la página
window.addEventListener('load', () => {
    hidePreloader();
});

// Failsafe final: forzar ocultamiento después de 1 segundo
setTimeout(() => {
    hidePreloader();
}, 1000);

/**
 * ============================================================================
 * FIN DEL ARCHIVO - GEOVISUALIZADOR DE ÁREAS DE INTERÉS
 * ============================================================================
 * 
 * Este sistema permite:
 * - Cargar y visualizar archivos KML de áreas de interés
 * - Realizar análisis geoespaciales con diferentes criterios
 * - Identificar localidades dentro de áreas definidas
 * - Generar reportes visuales con código de colores por CVEGEO
 * - Proporcionar una interfaz responsive y accesible
 * 
 * Desarrollado para la Secretaría de Energía (SENER) - Gobierno de México
 * ============================================================================
 */