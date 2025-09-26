/**
 * GEOVISUALIZADOR DE ÁREAS DE INTERÉS - SENER
 * ==========================================
 * 
 * Sistema para la visualización y análisis geoespacial de localidades
 * en relación con áreas de interés definidas por archivos KML.
 * 
 * Desarrollado para la Secretaría de Energía (SENER) - Gobierno de México
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

    // Marcar como hidden y ocultar visualmente
    pre.setAttribute('hidden', '');
    if (pre.style.display === 'none') return;

    pre.classList.add('preloader-hide');

    // Tras la transición CSS, eliminarlo del flujo de documentos
    setTimeout(() => {
        pre.style.display = 'none';
        // Recalcular tamaño del mapa después de cambios de layout
        if (typeof map !== 'undefined' && map) {
            setTimeout(() => map.invalidateSize(), 100);
        }
    }, 350);
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

    // Mostrar preloader
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
            layers: [baseMaps['SENER Oscuro']]
        });

        map.on('click', function(e) {
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

        layersControl = L.control.layers(baseMaps, {}, { collapsed: false }).addTo(map);

        // ====================================================================
        // CONFIGURACIÓN DE DATOS Y ELEMENTOS DEL DOM
        // ====================================================================

        // URLs de servicios de localidades (datos geoespaciales de INEGI)
        const localitiesUrl = 'https://cdn.sassoapps.com/Gabvy/localidades_4326.geojson';
        const localitiesPointsUrl = 'https://cdn.sassoapps.com/Gabvy/localidades_puntos.geojson'; // Puntos

        // Referencias a elementos del DOM para controles
        const kmlFileInput = document.getElementById('kmlFile');
        const uploadKmlBtn = document.getElementById('uploadKmlBtn');
        const areaTypeSelect = document.getElementById('areaType');
        const performClipBtn = document.getElementById('performClipBtn');
        const resetViewBtn = document.getElementById('resetViewBtn');
        const clearMapBtn = document.getElementById('clearMap');
        const centerKmlBtn = document.getElementById('centerKmlBtn');
        const cvegeoListDiv = document.getElementById('cvegeoList');

        // Mapa para mantener referencias de features por CVEGEO (para navegación)
        let featureLayersById = new Map(); // CVEGEO -> {bounds|latlng, layer}

        // Estado inicial: deshabilitar botones hasta que se carguen datos
        if (uploadKmlBtn) uploadKmlBtn.disabled = true;
        if (performClipBtn) performClipBtn.disabled = true;

        // ====================================================================
        // FUNCIONES DE MANEJO DE DATOS GEOESPACIALES
        // ====================================================================

        /**
         * Carga los datos de localidades desde el servidor de forma asíncrona
         * Los datos provienen de INEGI y contienen información geoespacial de todas
         * las localidades de México con sus respectivos CVEGEO
         */
        async function loadLocalitiesData() {
            try {
                // Cargar polígonos de localidades
                const response = await fetch(localitiesUrl);
                if (!response.ok) {
                    throw new Error(`Error HTTP! status: ${response.status}`);
                }
                localitiesData = await response.json();
                console.log(`Localidades polígonos cargadas: ${localitiesData.features.length}`);

                // Cargar puntos de localidades
                const pointsResponse = await fetch(localitiesPointsUrl);
                if (!pointsResponse.ok) {
                    throw new Error(`Error HTTP puntos! status: ${pointsResponse.status}`);
                }
                localitiesPointsData = await pointsResponse.json();
                console.log(`Localidades puntos cargadas: ${localitiesPointsData.features.length}`);

                showAlert(`Localidades cargadas: ${localitiesData.features.length} polígonos + ${localitiesPointsData.features.length} puntos`, 'success');

            } catch (error) {
                console.error('Error al cargar localidades:', error);
                showAlert('Error al cargar localidades desde el servidor. Verifica tu conexión.', 'danger', 6000);
                throw error; // Re-lanzar para manejo en funciones que llaman
            }
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
            uploadKmlBtn.disabled = true;
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
                if (bufferLayer) map.removeLayer(bufferLayer);
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

                // Para área núcleo: generar buffer de 500 metros
                if (areaType === 'nucleo') {
                    try {
                        const buffer = T.buffer(kmlPolygon, 500, { units: 'meters' });
                        clipArea = buffer;

                        // Visualizar buffer con estilo diferente
                        bufferLayer = L.geoJSON(buffer, {
                            style: {
                                color: '#0078ff',
                                weight: 2,
                                fillColor: '#0078ff',
                                fillOpacity: 0.1
                            }
                        }).addTo(map);

                        updateProgress(15, 'Buffer generado. Intersectando con localidades…');

                    } catch (e) {
                        console.error('Error creando buffer:', e);
                        showModal({
                            title: 'Error al generar buffer',
                            message: 'No se pudo crear el buffer de 500m. Verifica la geometría del KML.',
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
                const total = localitiesData.features.length;  // Total de localidades a procesar (~30,000)
                let processed = 0;  // Contador de progreso

                // Configurar procesamiento en lotes para permitir repintado de UI
                const base = 20; // % reservado para setup inicial  
                const loopSpan = 75; // % dedicado al bucle de intersección (20% → 95%)
                const batchSize = Math.max(500, Math.floor(total / 200)); // ~200 lotes óptimos
                const features = localitiesData.features;  // Referencia al array de localidades

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

                if (localitiesPointsData && localitiesPointsData.features) {
                    updateProgress(96, `Procesando puntos adicionales…`);

                    const pointsFeatures = localitiesPointsData.features;
                    for (const point of pointsFeatures) {
                        const cvegeo = point.properties?.CVEGEO;
                        // Solo incluir si intersecta y no está ya en los polígonos
                        if (cvegeo && !existingCvegeo.has(cvegeo) && T.booleanIntersects(point.geometry, clipArea.geometry)) {
                            clippedPoints.push(point);
                        }
                    }
                }

                updateProgress(97, `Encontradas ${clipped.length} localidades + ${clippedPoints.length} puntos adicionales. Preparando visualización…`);

                // ============================================================
                // VISUALIZACIÓN DE RESULTADOS Y GENERACIÓN DE CAPAS
                // ============================================================

                if (clipped.length > 0 || clippedPoints.length > 0) {
                    // Generar paleta de colores distinta por CVEGEO
                    const colorsById = new Map();
                    const palette = [
                        '#d11149', '#1a8fe3', '#119822', '#ff7f0e', '#9467bd',
                        '#e377c2', '#17becf', '#bcbd22', '#8c564b', '#2ca02c',
                        '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
                        '#a65628', '#f781bf', '#999999', '#66c2a5', '#fc8d62'
                    ];

                    let colorIndex = 0;
                    const allFeatures = [...clipped, ...clippedPoints];
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
                                    layer.bindPopup(`<strong>Localidad (Polígono)</strong><br><strong>Nombre:</strong> ${nombre}<br><strong>CVEGEO:</strong> ${props.CVEGEO || '—'}`);
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
                                    layer.bindPopup(`<strong>Localidad (Coordenadas)</strong><br><strong>Nombre:</strong> ${nombre}<br><strong>CVEGEO:</strong> ${props.CVEGEO || '—'}<br><small><em>Identificada por coordenadas geográficas.</em></small>`);
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
        // CONFIGURACIÓN DE EVENTOS DE INTERFAZ
        // ====================================================================

        /**
         * Configuración de todos los event listeners para la interfaz de usuario
         * Maneja la interactividad del formulario y controles del mapa
         */

        // Validación en tiempo real del archivo seleccionado
        kmlFileInput.addEventListener('change', (e) => {
            const hasFiles = e.target.files.length > 0;
            uploadKmlBtn.disabled = !hasFiles;

            if (hasFiles) {
                const file = e.target.files[0];
                // Mostrar información del archivo seleccionado
                const fileInfo = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
                uploadKmlBtn.innerHTML = `<i class="bi bi-upload me-1"></i>Subir: ${fileInfo}`;
            } else {
                uploadKmlBtn.innerHTML = `<i class="bi bi-upload me-1"></i>Subir KML`;
            }
        });

        // Procesar archivo KML seleccionado con validaciones mejoradas
        uploadKmlBtn.addEventListener('click', () => {
            const file = kmlFileInput.files[0];
            if (file) {
                // Deshabilitar temporalmente para evitar clicks múltiples
                uploadKmlBtn.disabled = true;
                uploadKmlBtn.innerHTML = `<i class="bi bi-hourglass-split me-1"></i>Procesando...`;

                // Procesar con delay para mostrar feedback visual
                setTimeout(() => {
                    processKmlFile(file);
                    // Restaurar estado original
                    uploadKmlBtn.disabled = false;
                    uploadKmlBtn.innerHTML = `<i class="bi bi-upload me-1"></i>Subir KML`;
                    // Limpiar selección para permitir re-cargar el mismo archivo
                    kmlFileInput.value = '';
                }, 100);
            } else {
                showAlert('Por favor, selecciona un archivo KML válido antes de continuar.', 'info');
            }
        });

        // Ejecutar recorte de localidades con protección contra clicks múltiples y validaciones
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
            performClipBtn.innerHTML = `<i class="bi bi-hourglass-split me-1"></i>Procesando...`;

            Promise.resolve()
                .then(() => performClipping())
                .catch(error => {
                    console.error('Error en performClipping:', error);
                    showModal({ title: 'Error', message: 'Ocurrió un error inesperado durante el procesamiento.', okText: 'Cerrar' });
                })
                .finally(() => {
                    // Re-habilitar solo si hay KML cargado
                    performClipBtn.disabled = !kmlGeoJson;
                    performClipBtn.innerHTML = `<i class="bi bi-scissors me-1"></i>Realizar Recorte`;
                });
        });

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
            uploadKmlBtn.innerHTML = `<i class="bi bi-upload me-1"></i>Subir KML`;
        });

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