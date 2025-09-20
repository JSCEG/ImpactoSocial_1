/**
 * GEOVISUALIZADOR DE ÁREAS DE INTERÉS - VERSIÓN MULTICAPA
 * ========================================================
 * 
 * Sistema para análisis geoespacial que permite cargar un área de interés
 * desde un archivo KML y analizar qué elementos de diferentes capas
 * (localidades, pueblos indígenas, municipios, etc.) se encuentran dentro.
 */

// ============================================================================
// VARIABLES PRINCIPALES DE LA APLICACIÓN
// ============================================================================

let map; // El mapa principal de Leaflet
let kmlLayer = null; // Capa que muestra el polígono KML subido
let bufferLayer = null; // Capa del buffer de 500m para área núcleo
let kmlGeoJson = null; // Datos del KML convertidos a GeoJSON
let lastAreaBounds = null; // Para poder volver a centrar en el área analizada

// ============================================================================
// UTILIDADES Y VARIABLES DE DATOS
// ============================================================================

// Función para formatear números con separadores de miles
function formatNumber(n) {
    if (n == null || isNaN(n)) return '0';
    try { return n.toLocaleString('es-MX'); } catch (_) { return String(n); }
}

// Variables para almacenar los datos originales de cada capa geoespacial
let localitiesData = null;      // Localidades de México
let atlasData = null;           // Atlas de Pueblos Indígenas
let municipiosData = null;      // Municipios
let regionesData = null;        // Regiones Indígenas
let ranData = null;             // Registro Agrario Nacional
let lenguasData = null;         // Lenguas Indígenas
let zaPublicoData = null;       // Zonas de Amortiguamiento Público
let zaPublicoAData = null;      // Zonas de Amortiguamiento Público A
let anpEstatalData = null;      // Áreas Naturales Protegidas Estatales
let ramsarData = null;          // Sitios Ramsar
let sitioArqueologicoData = null; // Sitios Arqueológicos
let zHistoricosData = null;     // Zonas Históricas
let locIndigenasData = null;    // Localidades Indígenas Datos
let rutaWixarikaData = null;    // Ruta Wixarika
let localidadesDatosData = null; // Localidades Datos Adicionales (JSON tabular)

// Variables para las capas filtradas que se muestran en el mapa
let clippedLocalitiesLayer = null;
let clippedAtlasLayer = null;
let clippedMunicipiosLayer = null;
let clippedRegionesLayer = null;
let clippedRanLayer = null;
let clippedLenguasLayer = null;
let clippedZaPublicoLayer = null;
let clippedZaPublicoALayer = null;
let clippedAnpEstatalLayer = null;
let clippedRamsarLayer = null;
let clippedSitioArqueologicoLayer = null;
let clippedZHistoricosLayer = null;
let clippedLocIndigenasLayer = null;
let clippedRutaWixarikaLayer = null;

// Control de capas de Leaflet y utilidades de navegación
let overlaysControl = null;
let featureLayersById = new Map();  // Para poder navegar a elementos específicos
let highlightLayer = null;          // Para resaltar elementos seleccionados

// Variables para el reporte Excel
let totalElements = 0;              // Total de elementos encontrados
let layersData = {};                // Datos de todas las capas para el reporte

// ============================================================================
// FUNCIONES PARA CARGAR LIBRERÍAS EXTERNAS
// ============================================================================

/**
 * Detecta si el navegador es basado en Chromium (Chrome, Edge, Brave)
 */
function isChromiumBased() {
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.includes('chrome') || userAgent.includes('chromium') ||
        userAgent.includes('edge') || userAgent.includes('brave');
}

/**
 * Carga un script de forma asíncrona - útil para cargar librerías bajo demanda
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
 * Se asegura de que Turf.js esté disponible, probando múltiples CDNs
 * Turf.js es la librería que usamos para operaciones geoespaciales complejas
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
        } catch (_) { /* Si falla un CDN, prueba el siguiente */ }
    }
    throw new Error('Turf no disponible desde ningún CDN');
}

// ============================================================================
// SISTEMA DE NOTIFICACIONES Y FEEDBACK AL USUARIO
// ============================================================================

/**
 * Muestra alertas bonitas usando Bootstrap que se auto-ocultan después de un tiempo
 */
function showAlert(message, type = 'info', timeoutMs = 4000) {
    const container = document.getElementById('alertContainer');
    if (!container) {
        alert(message);  // Fallback si no hay contenedor
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

    // Auto-ocultar después del tiempo especificado
    if (timeoutMs > 0) {
        setTimeout(() => {
            wrapper.classList.remove('show');
            wrapper.addEventListener('transitionend', () => wrapper.remove());
        }, timeoutMs);
    }

    return wrapper;
}

/**
 * Muestra un modal para mensajes importantes que requieren confirmación del usuario
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
        showAlert(message, 'info', 5000);  // Fallback si el modal no funciona
    }
}

/**
 * Oculta la pantalla de carga con una transición suave
 */
function hidePreloader() {
    console.log('[DEBUG] hidePreloader called');
    const pre = document.getElementById('preloader');
    if (!pre) {
        console.log('[DEBUG] Preloader element not found');
        return;
    }

    pre.setAttribute('hidden', '');
    if (pre.style.display === 'none') {
        console.log('[DEBUG] Preloader already hidden');
        return;
    }

    console.log('[DEBUG] Hiding preloader with animation');
    pre.classList.add('preloader-hide');

    setTimeout(() => {
        pre.style.display = 'none';
        console.log('[DEBUG] Preloader hidden');
        // Asegurar que el mapa se redibuje correctamente
        if (typeof map !== 'undefined' && map) {
            setTimeout(() => map.invalidateSize(), 100);
        }
    }, 350);
}

/**
 * Muestra la pantalla de carga durante operaciones que toman tiempo
 */
function showPreloader() {
    console.log('[DEBUG] showPreloader called');
    let pre = document.getElementById('preloader');

    // Crear el preloader si no existe
    if (!pre) {
        console.log('[DEBUG] Creating preloader element');
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

    console.log('[DEBUG] Showing preloader');
    pre.classList.remove('preloader-hide');
    pre.removeAttribute('hidden');
    pre.style.display = 'flex';
}

/**
 * Actualiza la barra de progreso para mostrar el avance de las operaciones
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
    console.log('[DEBUG] initApp started');
    try {
        console.log('[DEBUG] Checking preloader state');
        // Solo ocultar preloader si no hay operaciones en curso
        if (!document.getElementById('preloader')?.style.display || document.getElementById('preloader').style.display === 'none') {
            console.log('[DEBUG] Hiding preloader initially');
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

        // URLs de las capas geoespaciales
        const urls = {
            localidades: 'https://cdn.sassoapps.com/Gabvy/localidades_4326.geojson',
            atlas: 'https://cdn.sassoapps.com/Gabvy/atlaspueblosindigenas.geojson',
            municipios: 'https://cdn.sassoapps.com/Gabvy/municipios_4326.geojson',
            regiones: 'https://cdn.sassoapps.com/Gabvy/regionesindigenas.geojson',
            ran: 'https://cdn.sassoapps.com/Gabvy/RAN_4326.geojson',
            lenguas: 'https://cdn.sassoapps.com/Gabvy/lenguasindigenas.geojson',
            za_publico: 'https://cdn.sassoapps.com/Gabvy/ZA_publico.geojson',
            za_publico_a: 'https://cdn.sassoapps.com/Gabvy/ZA_publico_a.geojson',
            anp_estatal: 'https://cdn.sassoapps.com/Gabvy/anp_estatal.geojson',
            ramsar: 'https://cdn.sassoapps.com/Gabvy/ramsar.geojson',
            sitio_arqueologico: 'https://cdn.sassoapps.com/Gabvy/sitio_arqueologico.geojson',
            z_historicos: 'https://cdn.sassoapps.com/Gabvy/z_historicos.geojson',
            loc_indigenas_datos: 'https://cdn.sassoapps.com/Gabvy/loc_indigenas_datos.geojson',
            rutaWixarika: 'https://cdn.sassoapps.com/Gabvy/rutaWixarika.geojson',
            localidadesdatos_solo_datos: 'https://cdn.sassoapps.com/Gabvy/localidadesdatos_solo_datos.json'
        };

        // URLs alternativas con proxy CORS (fallback automático)
        const proxyUrls = {
            localidades: 'https://api.allorigins.win/get?url=' + encodeURIComponent(urls.localidades),
            atlas: 'https://api.allorigins.win/get?url=' + encodeURIComponent(urls.atlas),
            municipios: 'https://api.allorigins.win/get?url=' + encodeURIComponent(urls.municipios),
            regiones: 'https://api.allorigins.win/get?url=' + encodeURIComponent(urls.regiones),
            ran: 'https://api.allorigins.win/get?url=' + encodeURIComponent(urls.ran),
            lenguas: 'https://api.allorigins.win/get?url=' + encodeURIComponent(urls.lenguas),
            za_publico: 'https://api.allorigins.win/get?url=' + encodeURIComponent(urls.za_publico),
            za_publico_a: 'https://api.allorigins.win/get?url=' + encodeURIComponent(urls.za_publico_a),
            anp_estatal: 'https://api.allorigins.win/get?url=' + encodeURIComponent(urls.anp_estatal),
            ramsar: 'https://api.allorigins.win/get?url=' + encodeURIComponent(urls.ramsar),
            sitio_arqueologico: 'https://api.allorigins.win/get?url=' + encodeURIComponent(urls.sitio_arqueologico),
            z_historicos: 'https://api.allorigins.win/get?url=' + encodeURIComponent(urls.z_historicos),
            loc_indigenas_datos: 'https://api.allorigins.win/get?url=' + encodeURIComponent(urls.loc_indigenas_datos),
            rutaWixarika: 'https://api.allorigins.win/get?url=' + encodeURIComponent(urls.rutaWixarika),
            localidadesdatos_solo_datos: 'https://api.allorigins.win/get?url=' + encodeURIComponent(urls.localidadesdatos_solo_datos)
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
                const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 segundos timeout

                // Intentar primero con CORS normal
                let response;
                try {
                    response = await fetch(url, {
                        signal: controller.signal,
                        mode: 'cors',
                        headers: {
                            'Accept': 'application/json',
                            'Cache-Control': 'no-cache'
                        }
                    });
                } catch (corsError) {
                    console.warn(`CORS falló para ${name}, intentando sin CORS:`, corsError);

                    // Fallback: intentar sin CORS (para navegadores Chromium estrictos)
                    response = await fetch(url, {
                        signal: controller.signal,
                        mode: 'no-cors',
                        cache: 'no-cache'
                    });
                }

                clearTimeout(timeoutId);

                if (!response.ok && response.status !== 0) { // status 0 es normal en no-cors
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                // En modo no-cors, response.json() puede fallar, usar texto y parsear
                let data;
                try {
                    data = await response.json();
                } catch (jsonError) {
                    console.warn(`JSON parsing falló para ${name}, intentando como texto:`, jsonError);
                    const text = await response.text();
                    if (text) {
                        data = JSON.parse(text);
                    } else {
                        throw new Error(`Respuesta vacía para ${name}`);
                    }
                }

                console.log(`${name} cargado exitosamente: ${data.features?.length || 0} features`);
                return data;

            } catch (error) {
                console.error(`Error cargando ${name}:`, error);
                if (error.name === 'AbortError') {
                    throw new Error(`Timeout cargando ${name} (15s)`);
                }

                // Último fallback: usar un proxy CORS público
                console.warn(`Intentando proxy CORS para ${name}...`);
                try {
                    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
                    const proxyResponse = await fetch(proxyUrl, {
                        headers: { 'Accept': 'application/json' }
                    });

                    if (proxyResponse.ok) {
                        const proxyData = await proxyResponse.json();
                        const data = JSON.parse(proxyData.contents);
                        console.log(`${name} cargado vía proxy: ${data.features?.length || 0} features`);
                        return data;
                    }
                } catch (proxyError) {
                    console.error(`Proxy también falló para ${name}:`, proxyError);
                }

                throw new Error(`Error cargando ${name}: ${error.message}`);
            }
        }

        /**
         * Carga datos JSON tabulares (no GeoJSON)
         */
        async function loadJsonData(url, name) {
            try {
                console.log(`Cargando ${name} desde: ${url}`);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 segundos timeout

                const response = await fetch(url, {
                    signal: controller.signal,
                    mode: 'cors',
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
                console.log(`${name} cargado exitosamente: ${Array.isArray(data) ? data.length : 'N/A'} registros`);
                return data;

            } catch (error) {
                console.error(`Error cargando ${name}:`, error);
                if (error.name === 'AbortError') {
                    throw new Error(`Timeout cargando ${name} (15s)`);
                }

                // Último fallback: usar un proxy CORS público
                console.warn(`Intentando proxy CORS para ${name}...`);
                try {
                    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
                    const proxyResponse = await fetch(proxyUrl, {
                        headers: { 'Accept': 'application/json' }
                    });

                    if (proxyResponse.ok) {
                        const proxyData = await proxyResponse.json();
                        const data = JSON.parse(proxyData.contents);
                        console.log(`${name} cargado vía proxy: ${Array.isArray(data) ? data.length : 'N/A'} registros`);
                        return data;
                    }
                } catch (proxyError) {
                    console.error(`Proxy también falló para ${name}:`, proxyError);
                }

                throw new Error(`Error cargando ${name}: ${error.message}`);
            }
        }

        async function loadDataOptional() {
            console.log('[DEBUG] loadDataOptional started');
            try {
                console.log('[DEBUG] Showing preloader');
                showPreloader();
                updateProgress(5, 'Iniciando carga de capas geoespaciales...');

                // Mostrar advertencia específica para navegadores Chromium
                if (isChromiumBased()) {
                    updateProgress(8, 'Detectado navegador Chromium - usando estrategia CORS especial...');
                }

                // Cargar capas secuencialmente para evitar problemas de concurrencia
                updateProgress(5, 'Cargando localidades...');
                localitiesData = await loadSingleLayer(urls.localidades, 'Localidades');

                updateProgress(10, 'Cargando atlas pueblos indígenas...');
                atlasData = await loadSingleLayer(urls.atlas, 'Atlas Pueblos Indígenas');

                updateProgress(15, 'Cargando municipios...');
                municipiosData = await loadSingleLayer(urls.municipios, 'Municipios');

                updateProgress(20, 'Cargando regiones indígenas...');
                regionesData = await loadSingleLayer(urls.regiones, 'Regiones Indígenas');

                updateProgress(25, 'Cargando RAN...');
                ranData = await loadSingleLayer(urls.ran, 'RAN');

                updateProgress(30, 'Cargando lenguas indígenas...');
                lenguasData = await loadSingleLayer(urls.lenguas, 'Lenguas Indígenas');

                updateProgress(35, 'Cargando zonas de amortiguamiento público...');
                zaPublicoData = await loadSingleLayer(urls.za_publico, 'ZA Público');

                updateProgress(40, 'Cargando zonas de amortiguamiento público A...');
                zaPublicoAData = await loadSingleLayer(urls.za_publico_a, 'ZA Público A');

                updateProgress(45, 'Cargando ANP estatales...');
                anpEstatalData = await loadSingleLayer(urls.anp_estatal, 'ANP Estatales');

                updateProgress(50, 'Cargando sitios Ramsar...');
                ramsarData = await loadSingleLayer(urls.ramsar, 'Ramsar');

                updateProgress(55, 'Cargando sitios arqueológicos...');
                sitioArqueologicoData = await loadSingleLayer(urls.sitio_arqueologico, 'Sitios Arqueológicos');

                updateProgress(60, 'Cargando zonas históricas...');
                zHistoricosData = await loadSingleLayer(urls.z_historicos, 'Zonas Históricas');

                updateProgress(65, 'Cargando localidades indígenas datos...');
                locIndigenasData = await loadSingleLayer(urls.loc_indigenas_datos, 'Loc Indígenas Datos');

                updateProgress(70, 'Cargando ruta Wixarika...');
                rutaWixarikaData = await loadSingleLayer(urls.rutaWixarika, 'Ruta Wixarika');

                updateProgress(75, 'Cargando localidades datos adicionales...');
                localidadesDatosData = await loadJsonData(urls.localidadesdatos_solo_datos, 'Localidades Datos Adicionales');

                // Merge localidades datos adicionales into localitiesData
                if (localitiesData && localidadesDatosData) {
                    console.log('Mezclando datos adicionales de localidades...');
                    localitiesData.features.forEach(feature => {
                        const cvegeo = feature.properties.CVEGEO;
                        const extra = localidadesDatosData.find(d => d.CVEGEO === cvegeo);
                        if (extra) {
                            Object.assign(feature.properties, extra);
                        }
                    });
                    console.log('Mezcla completada.');
                }

                updateProgress(100, 'Todas las capas cargadas exitosamente');
                console.log("Todas las capas cargadas correctamente.");
                console.log('[DEBUG] About to hide preloader after successful load');
                showAlert('Todas las capas geoespaciales han sido cargadas exitosamente', 'success');

                setTimeout(() => {
                    console.log('[DEBUG] Hiding preloader after timeout');
                    hidePreloader();
                }, 800);

            } catch (err) {
                console.error("Error cargando capas:", err);
                updateProgress(0, 'Error en la carga');

                let errorMessage = 'Error al cargar capas desde el servidor.';
                if (err.message.includes('Timeout')) {
                    errorMessage = 'Timeout al cargar capas. El servidor tardó demasiado en responder.';
                } else if (err.message.includes('HTTP')) {
                    errorMessage = 'Error del servidor al cargar capas. Verifica que las URLs sean correctas.';
                } else if (err.message.includes('Failed to fetch') || err.message.includes('CORS')) {
                    if (isChromiumBased()) {
                        errorMessage = 'Error de CORS: Los navegadores Chrome/Edge/Brave bloquean la carga de datos externos. Recomendamos usar Firefox para mejor compatibilidad, o contactar al administrador para configurar un servidor local.';
                    } else {
                        errorMessage = 'Error de conexión. Verifica tu conexión a internet y que el servidor esté disponible.';
                    }
                } else if (err.message.includes('NetworkError')) {
                    errorMessage = 'Error de red. Verifica tu conexión a internet.';
                }

                console.log('[DEBUG] Error in loadDataOptional, about to hide preloader');
                showAlert(errorMessage + ' Usando datos de ejemplo para continuar.', 'warning', 8000);
                hidePreloader();

                // Usar datos de ejemplo para desarrollo cuando falla la carga externa
                console.warn('Carga de datos externos falló. Usando datos de ejemplo para desarrollo.');
                console.log('[DEBUG] Creating sample data');
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
                            NOM_ENT: "Ciudad de México",
                            AMBITO: "Urbano"
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
                            NOM_ENT: "Jalisco",
                            AMBITO: "Urbano"
                        },
                        geometry: {
                            type: "Point",
                            coordinates: [-103.3496, 20.6597]
                        }
                    },
                    {
                        type: "Feature",
                        properties: {
                            CVEGEO: "010060024",
                            CVE_ENT: "01",
                            CVE_MUN: "006",
                            CVE_LOC: "0024",
                            NOMGEO: "Ojo Zarco [Colonia]",
                            AMBITO: "Rural",
                            NOM_LOC: "Ojo Zarco [Colonia]",
                            NOM_MUN: "Aguascalientes",
                            NOM_ENT: "Aguascalientes"
                        },
                        geometry: {
                            type: "Point",
                            coordinates: [-102.3, 21.9]
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

            // Configurar ZA Público A (área - polígono)
            zaPublicoAData = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: {
                            NOMBRE: "Tetzcotzinco",
                            TIPO: "Zona Arqueológica Abierta al Público",
                            ESTADO: "México",
                            MUNICIPIO: "Texcoco",
                            LOCALIDAD: "No aplica"
                        },
                        geometry: {
                            type: "Polygon",
                            coordinates: [[
                                [-98.90, 19.50], [-98.85, 19.50], [-98.85, 19.55], [-98.90, 19.55], [-98.90, 19.50]
                            ]]
                        }
                    }
                ]
            };

            // Configurar ZA Público (puntos)
            zaPublicoData = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: {
                            NOMBRE: "Olintepec",
                            TIPO: "Zona Arqueológica Abierta al Público",
                            ESTADO: "Morelos",
                            MUNICIPIO: "Ayala",
                            LOCALIDAD: "No aplica"
                        },
                        geometry: {
                            type: "Point",
                            coordinates: [-99.05, 18.75]
                        }
                    }
                ]
            };

            // Configurar Zonas Históricas
            zHistoricosData = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: {
                            NOMBRE: "Zona de Monumentos Históricos calzada El Albarradón de San Cristóbal",
                            ESTADO: "México",
                            MUNICIPIO: "Ecatepec de Morelos",
                            LOCALIDAD: "Ecatepec de Morelos"
                        },
                        geometry: {
                            type: "Polygon",
                            coordinates: [[
                                [-99.05, 19.60], [-99.00, 19.60], [-99.00, 19.65], [-99.05, 19.65], [-99.05, 19.60]
                            ]]
                        }
                    }
                ]
            };

            // Configurar Sitios Arqueológicos
            sitioArqueologicoData = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: {
                            nombre: "El Vallecito",
                            nom_ent: "Baja California",
                            nom_mun: "Tecate",
                            nom_loc: "Agua de Fierro"
                        },
                        geometry: {
                            type: "Point",
                            coordinates: [-116.5, 32.5]
                        }
                    }
                ]
            };

            // Configurar Sitios Ramsar
            ramsarData = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: {
                            NOMBRE: "Estero El Soldado",
                            ESTADO: "Sonora",
                            MUNICIPIO: "Guaymas"
                        },
                        geometry: {
                            type: "Polygon",
                            coordinates: [[
                                [-110.9, 27.9], [-110.8, 27.9], [-110.8, 28.0], [-110.9, 28.0], [-110.9, 27.9]
                            ]]
                        }
                    }
                ]
            };

            // Configurar Loc Indígenas Datos
            locIndigenasData = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: {
                            CVEGEO: "01001001",
                            ENTIDAD: "Aguascalientes",
                            MUNICIPIO: "Aguascalientes",
                            LOCALIDAD: "Aguascalientes",
                            POBTOTAL: 863893
                        },
                        geometry: {
                            type: "Point",
                            coordinates: [-102.3, 21.9]
                        }
                    }
                ]
            };

            // Configurar Ruta Wixarika
            rutaWixarikaData = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: {
                            Name: "Ruta Cultural Wixarika"
                        },
                        geometry: {
                            type: "MultiPolygon",
                            coordinates: [[[
                                [-104.0, 21.0], [-103.5, 21.0], [-103.5, 21.5], [-104.0, 21.5], [-104.0, 21.0]
                            ]]]
                        }
                    }
                ]
            };

            // Inicializar otras capas como vacías
            atlasData = { type: "FeatureCollection", features: [] };
            regionesData = { type: "FeatureCollection", features: [] };
            ranData = { type: "FeatureCollection", features: [] };
            anpEstatalData = { type: "FeatureCollection", features: [] };

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
                'lenguas': 'Lenguas Indígenas',
                'za_publico': 'ZA Público',
                'za_publico_a': 'ZA Público A',
                'anp_estatal': 'ANP Estatales',
                'ramsar': 'Ramsar',
                'sitio_arqueologico': 'Sitios Arqueológicos',
                'z_historicos': 'Zonas Históricas',
                'loc_indigenas_datos': 'Loc Indígenas Datos',
                'rutaWixarika': 'Ruta Wixarika'
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
                'lenguas': clippedLenguasLayer,
                'za_publico': clippedZaPublicoLayer,
                'za_publico_a': clippedZaPublicoALayer,
                'anp_estatal': clippedAnpEstatalLayer,
                'ramsar': clippedRamsarLayer,
                'sitio_arqueologico': clippedSitioArqueologicoLayer,
                'z_historicos': clippedZHistoricosLayer,
                'loc_indigenas_datos': clippedLocIndigenasLayer,
                'rutaWixarika': clippedRutaWixarikaLayer
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
        function updateLayersDisplay(layersDataParam) {
            layersContainer.innerHTML = '';

            // Actualizar variables globales para el reporte
            layersData = layersDataParam;
            totalElements = 0;

            // Definir colores para cada capa
            const layerColors = {
                localidades: '#008000',
                atlas: '#ff00ff',
                municipios: '#0000ff',
                regiones: '#ffa500',
                ran: '#ff0000',
                lenguas: '#00ffff',
                za_publico: '#800080',
                za_publico_a: '#800000',
                anp_estatal: '#008080',
                ramsar: '#808000',
                sitio_arqueologico: '#808080',
                z_historicos: '#400080',
                loc_indigenas_datos: '#8000ff',
                rutaWixarika: '#ff8000'
            };

            // Crear secciones para cada capa
            Object.entries(layersData).forEach(([layerName, data]) => {
                if (data.features) {
                    console.log(`[DEBUG] Processing layer ${layerName} with ${data.features.length} features`);
                    const propertyMap = {
                        localidades: 'CVEGEO',
                        atlas: 'CVEGEO',
                        municipios: 'CVEGEO',
                        regiones: 'Name',
                        ran: 'Clv_Unica',
                        lenguas: 'Lengua',
                        za_publico: 'Zona Arqueológica',
                        za_publico_a: 'Zona Arqueológica',
                        anp_estatal: 'NOMBRE',
                        ramsar: 'RAMSAR',
                        sitio_arqueologico: 'nombre',
                        z_historicos: 'Nombre',
                        loc_indigenas_datos: 'LOCALIDAD',
                        rutaWixarika: 'Name'
                    };

                    const titleMap = {
                        localidades: 'Localidades',
                        atlas: 'Atlas Pueblos Indígenas',
                        municipios: 'Municipios',
                        regiones: 'Regiones Indígenas',
                        ran: 'RAN',
                        lenguas: 'Lenguas Indígenas',
                        za_publico: 'Zonas Arqueológicas (Puntos)',
                        za_publico_a: 'Zonas Arqueológicas (Áreas)',
                        anp_estatal: 'ANP Estatales',
                        ramsar: 'Ramsar',
                        sitio_arqueologico: 'Sitios Arqueológicos',
                        z_historicos: 'Zonas Históricas',
                        loc_indigenas_datos: 'Loc Indígenas Datos',
                        rutaWixarika: 'Ruta Wixarika'
                    };

                    // Determinar si es la capa de lenguas para tratamiento especial
                    const isLenguasLayer = layerName === 'lenguas';

                    // Debug specific layers
                    if (['ramsar', 'sitio_arqueologico', 'z_historicos'].includes(layerName)) {
                        console.log(`[DEBUG] ${layerName} - Property map: ${propertyMap[layerName]}, First feature properties:`, data.features[0]?.properties);
                        console.log(`[DEBUG] ${layerName} - Property value for ${propertyMap[layerName]}:`, data.features[0]?.properties?.[propertyMap[layerName]]);
                        console.log(`[DEBUG] ${layerName} - All property keys:`, Object.keys(data.features[0]?.properties || {}));
                        console.log(`[DEBUG] ${layerName} - All property keys values:`, data.features[0]?.properties);
                        if (layerName === 'ramsar') {
                            console.log(`[DEBUG] ramsar detailed properties:`, JSON.stringify(data.features[0]?.properties, null, 2));
                        }
                    }

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

            // Habilitar/deshabilitar botón de descarga
            const downloadReportBtn = document.getElementById('downloadReportBtn');
            if (downloadReportBtn) {
                downloadReportBtn.disabled = totalElements === 0;
            }
        }

        /**
         * Limpia todas las capas del mapa y resetea el estado de la aplicación
         */
        function clearAllLayers() {
            // Remover todas las capas del mapa
            [kmlLayer, bufferLayer, clippedLocalitiesLayer, clippedAtlasLayer, clippedMunicipiosLayer, clippedRegionesLayer, clippedRanLayer, clippedLenguasLayer, clippedZaPublicoLayer, clippedZaPublicoALayer, clippedAnpEstatalLayer, clippedRamsarLayer, clippedSitioArqueologicoLayer, clippedZHistoricosLayer, clippedLocIndigenasLayer, clippedRutaWixarikaLayer, highlightLayer]
                .forEach(layer => { if (layer) map.removeLayer(layer); });

            // Resetear variables de estado
            kmlLayer = bufferLayer = clippedLocalitiesLayer = clippedAtlasLayer = clippedMunicipiosLayer = clippedRegionesLayer = clippedRanLayer = clippedLenguasLayer = clippedZaPublicoLayer = clippedZaPublicoALayer = clippedAnpEstatalLayer = clippedRamsarLayer = clippedSitioArqueologicoLayer = clippedZHistoricosLayer = clippedLocIndigenasLayer = clippedRutaWixarikaLayer = highlightLayer = null;
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

            // Resetear variables globales del reporte
            totalElements = 0;
            layersData = {};

            // Recrear control de capas
            if (overlaysControl) {
                map.removeControl(overlaysControl);
            }
            overlaysControl = L.control.layers(null, null, { collapsed: false }).addTo(map);

            // Deshabilitar botón de descarga
            const downloadReportBtn = document.getElementById('downloadReportBtn');
            if (downloadReportBtn) {
                downloadReportBtn.disabled = true;
            }
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
                    { data: lenguasData, name: 'Lenguas Indígenas' },
                    { data: zaPublicoData, name: 'ZA Público' },
                    { data: zaPublicoAData, name: 'ZA Público A' },
                    { data: anpEstatalData, name: 'ANP Estatales' },
                    { data: ramsarData, name: 'Ramsar' },
                    { data: sitioArqueologicoData, name: 'Sitios Arqueológicos' },
                    { data: zHistoricosData, name: 'Zonas Históricas' },
                    { data: locIndigenasData, name: 'Loc Indígenas Datos' },
                    { data: rutaWixarikaData, name: 'Ruta Wixarika' }
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
                [clippedLocalitiesLayer, clippedAtlasLayer, clippedMunicipiosLayer, clippedRegionesLayer, clippedRanLayer, clippedLenguasLayer, clippedZaPublicoLayer, clippedZaPublicoALayer, clippedAnpEstatalLayer, clippedRamsarLayer, clippedSitioArqueologicoLayer, clippedZHistoricosLayer]
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

                // Inicializar todas las capas posibles con arrays vacíos
                const allLayerNames = ['localidades', 'atlas', 'municipios', 'regiones', 'ran', 'lenguas', 'za_publico', 'za_publico_a', 'anp_estatal', 'ramsar', 'sitio_arqueologico', 'z_historicos', 'loc_indigenas_datos', 'rutaWixarika'];
                allLayerNames.forEach(name => {
                    layersData[name] = { features: [] };
                });

                if (localitiesData && localitiesData.features) {
                    updateProgress(20 + (processedCount * 60 / totalLayers), 'Procesando localidades…');
                    const locResult = clipLayer(localitiesData, "CVEGEO",
                        { pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 6, fillColor: '#008000', color: '#000', weight: 1, opacity: 1, fillOpacity: 0.8 }) },
                        p => createPopupContent('Localidad', '🏘️', [
                            { value: p.NOM_LOC || p.NOMBRE || 'Sin nombre', isMain: true },
                            { label: 'CVEGEO', value: p.CVEGEO },
                            { label: 'Municipio', value: p.NOM_MUN || p.MUNICIPIO },
                            { label: 'Estado', value: p.NOM_ENT || p.ESTADO },
                            { label: 'Ámbito', value: p.AMBITO }
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
                } else {
                    // Crear capa vacía para mostrar en el control de capas
                    clippedAtlasLayer = L.layerGroup().addTo(map);
                    overlaysControl.addOverlay(clippedAtlasLayer, "Atlas Pueblos Indígenas");
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
                } else {
                    clippedMunicipiosLayer = L.layerGroup().addTo(map);
                    overlaysControl.addOverlay(clippedMunicipiosLayer, "Municipios");
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
                } else {
                    clippedRegionesLayer = L.layerGroup().addTo(map);
                    overlaysControl.addOverlay(clippedRegionesLayer, "Regiones Indígenas");
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
                } else {
                    clippedRanLayer = L.layerGroup().addTo(map);
                    overlaysControl.addOverlay(clippedRanLayer, "RAN");
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
                } else {
                    clippedLenguasLayer = L.layerGroup().addTo(map);
                    overlaysControl.addOverlay(clippedLenguasLayer, "Lenguas Indígenas");
                }

                if (zaPublicoData && zaPublicoData.features) {
                    updateProgress(20 + (processedCount * 60 / totalLayers), 'Procesando ZA público…');
                    const zaPublicoResult = clipLayer(zaPublicoData, "Zona Arqueológica",
                        { pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 6, fillColor: '#800080', color: '#000', weight: 1, opacity: 1, fillOpacity: 0.8 }) },
                        p => createPopupContent('ZA Público', '🏞️', [
                            { value: p["Zona Arqueológica"] || 'Sin nombre', isMain: true },
                            { label: 'Estado', value: p.ESTADO },
                            { label: 'Municipio', value: p.MUNICIPIO },
                            { label: 'Localidad', value: p.LOCALIDAD }
                        ]), clipArea);
                    clippedZaPublicoLayer = zaPublicoResult.layer.addTo(map);
                    overlaysControl.addOverlay(clippedZaPublicoLayer, "Zonas Arqueológicas (Puntos)");
                    layersData.za_publico = { features: zaPublicoResult.clipped };
                    processedCount++;
                } else {
                    clippedZaPublicoLayer = L.layerGroup().addTo(map);
                    overlaysControl.addOverlay(clippedZaPublicoLayer, "Zonas Arqueológicas (Puntos)");
                }

                if (zaPublicoAData && zaPublicoAData.features) {
                    updateProgress(20 + (processedCount * 60 / totalLayers), 'Procesando ZA público A…');
                    const zaPublicoAResult = clipLayer(zaPublicoAData, "Zona Arqueológica",
                        { style: { color: '#800000', weight: 2, fillOpacity: 0.1 } },
                        p => createPopupContent('ZA Público A', '🏞️', [
                            { value: p["Zona Arqueológica"] || 'Sin nombre', isMain: true },
                            { label: 'Estado', value: p.ESTADO },
                            { label: 'Municipio', value: p.MUNICIPIO },
                            { label: 'Localidad', value: p.LOCALIDAD }
                        ]), clipArea);
                    clippedZaPublicoALayer = zaPublicoAResult.layer.addTo(map);
                    overlaysControl.addOverlay(clippedZaPublicoALayer, "Zonas Arqueológicas (Áreas)");
                    layersData.za_publico_a = { features: zaPublicoAResult.clipped };
                    processedCount++;
                } else {
                    clippedZaPublicoALayer = L.layerGroup().addTo(map);
                    overlaysControl.addOverlay(clippedZaPublicoALayer, "Zonas Arqueológicas (Áreas)");
                }

                if (anpEstatalData && anpEstatalData.features) {
                    updateProgress(20 + (processedCount * 60 / totalLayers), 'Procesando ANP estatales…');
                    const anpEstatalResult = clipLayer(anpEstatalData, "NOMBRE",
                        { style: { color: '#008080', weight: 2, fillOpacity: 0.1 } },
                        p => createPopupContent('ANP Estatal', '🌿', [
                            { value: p.NOMBRE || 'Sin nombre', isMain: true },
                            { label: 'Tipo', value: p.TIPO },
                            { label: 'Categoría DEC', value: p.CAT_DEC },
                            { label: 'Entidad', value: p.ENTIDAD },
                            { label: 'Municipio DEC', value: p.MUN_DEC }
                        ]), clipArea);
                    clippedAnpEstatalLayer = anpEstatalResult.layer.addTo(map);
                    overlaysControl.addOverlay(clippedAnpEstatalLayer, "ANP Estatales");
                    layersData.anp_estatal = { features: anpEstatalResult.clipped };
                    processedCount++;
                } else {
                    clippedAnpEstatalLayer = L.layerGroup().addTo(map);
                    overlaysControl.addOverlay(clippedAnpEstatalLayer, "ANP Estatales");
                }

                if (ramsarData && ramsarData.features) {
                    console.log('[DEBUG] Processing Ramsar data:', ramsarData.features.length, 'features');
                    updateProgress(20 + (processedCount * 60 / totalLayers), 'Procesando Ramsar…');
                    const ramsarResult = clipLayer(ramsarData, "RAMSAR",
                        { style: { color: '#808000', weight: 2, fillOpacity: 0.1 } },
                        p => createPopupContent('Sitio Ramsar', '🦆', [
                            { value: p.RAMSAR || 'Sin nombre', isMain: true },
                            { label: 'Estado', value: p.ESTADO },
                            { label: 'Municipio', value: p.MUNICIPIOS }
                        ]), clipArea);
                    console.log('[DEBUG] Ramsar clipped result:', ramsarResult.clipped.length, 'features');
                    clippedRamsarLayer = ramsarResult.layer.addTo(map);
                    overlaysControl.addOverlay(clippedRamsarLayer, "Ramsar");
                    layersData.ramsar = { features: ramsarResult.clipped };
                    processedCount++;
                } else {
                    console.log('[DEBUG] Ramsar data not available or empty');
                    clippedRamsarLayer = L.layerGroup().addTo(map);
                    overlaysControl.addOverlay(clippedRamsarLayer, "Ramsar");
                }

                if (sitioArqueologicoData && sitioArqueologicoData.features) {
                    console.log('[DEBUG] Processing Sitios Arqueológicos data:', sitioArqueologicoData.features.length, 'features');
                    updateProgress(20 + (processedCount * 60 / totalLayers), 'Procesando sitios arqueológicos…');
                    const sitioArqueologicoResult = clipLayer(sitioArqueologicoData, "nombre",
                        { pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 5, fillColor: '#808080', color: '#000', weight: 1, opacity: 1, fillOpacity: 0.8 }) },
                        p => createPopupContent('Sitio Arqueológico', '🏛️', [
                            { value: p.nombre || 'Sin nombre', isMain: true },
                            { label: 'Estado', value: p.nom_ent },
                            { label: 'Municipio', value: p.nom_mun },
                            { label: 'Localidad', value: p.nom_loc }
                        ]), clipArea);
                    console.log('[DEBUG] Sitios Arqueológicos clipped result:', sitioArqueologicoResult.clipped.length, 'features');
                    clippedSitioArqueologicoLayer = sitioArqueologicoResult.layer.addTo(map);
                    overlaysControl.addOverlay(clippedSitioArqueologicoLayer, "Sitios Arqueológicos");
                    layersData.sitio_arqueologico = { features: sitioArqueologicoResult.clipped };
                    processedCount++;
                } else {
                    console.log('[DEBUG] Sitios Arqueológicos data not available or empty');
                    clippedSitioArqueologicoLayer = L.layerGroup().addTo(map);
                    overlaysControl.addOverlay(clippedSitioArqueologicoLayer, "Sitios Arqueológicos");
                }

                if (zHistoricosData && zHistoricosData.features) {
                    console.log('[DEBUG] Processing Zonas Históricas data:', zHistoricosData.features.length, 'features');
                    updateProgress(20 + (processedCount * 60 / totalLayers), 'Procesando zonas históricas…');
                    const zHistoricosResult = clipLayer(zHistoricosData, "Nombre",
                        { style: { color: '#400080', weight: 2, fillOpacity: 0.1 } },
                        p => createPopupContent('Zona Histórica', '🏰', [
                            { value: p.Nombre || 'Sin nombre', isMain: true },
                            { label: 'Estado', value: p.ESTADO },
                            { label: 'Municipio', value: p.MUNICIPIO },
                            { label: 'Localidad', value: p.LOCALIDAD }
                        ]), clipArea);
                    console.log('[DEBUG] Zonas Históricas clipped result:', zHistoricosResult.clipped.length, 'features');
                    clippedZHistoricosLayer = zHistoricosResult.layer.addTo(map);
                    overlaysControl.addOverlay(clippedZHistoricosLayer, "Zonas Históricas");
                    layersData.z_historicos = { features: zHistoricosResult.clipped };
                    processedCount++;
                } else {
                    console.log('[DEBUG] Zonas Históricas data not available or empty');
                    clippedZHistoricosLayer = L.layerGroup().addTo(map);
                    overlaysControl.addOverlay(clippedZHistoricosLayer, "Zonas Históricas");
                }

                if (locIndigenasData && locIndigenasData.features) {
                    console.log('[DEBUG] Processing Loc Indígenas Datos data:', locIndigenasData.features.length, 'features');
                    updateProgress(20 + (processedCount * 60 / totalLayers), 'Procesando loc indígenas datos…');
                    const locIndigenasResult = clipLayer(locIndigenasData, "CVEGEO",
                        { pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 5, fillColor: '#8000ff', color: '#000', weight: 1, opacity: 1, fillOpacity: 0.8 }) },
                        p => createPopupContent('Loc Indígenas Datos', '🏘️', [
                            { value: p.CVEGEO || 'Sin CVEGEO', isMain: true },
                            { label: 'Entidad', value: p.ENTIDAD },
                            { label: 'Municipio', value: p.MUNICIPIO },
                            { label: 'Localidad', value: p.LOCALIDAD },
                            { label: 'Población Total', value: p.POBTOTAL }
                        ]), clipArea);
                    console.log('[DEBUG] Loc Indígenas Datos clipped result:', locIndigenasResult.clipped.length, 'features');
                    clippedLocIndigenasLayer = locIndigenasResult.layer.addTo(map);
                    overlaysControl.addOverlay(clippedLocIndigenasLayer, "Loc Indígenas Datos");
                    layersData.loc_indigenas_datos = { features: locIndigenasResult.clipped };
                    processedCount++;
                } else {
                    console.log('[DEBUG] Loc Indígenas Datos data not available or empty');
                    clippedLocIndigenasLayer = L.layerGroup().addTo(map);
                    overlaysControl.addOverlay(clippedLocIndigenasLayer, "Loc Indígenas Datos");
                }

                if (rutaWixarikaData && rutaWixarikaData.features) {
                    console.log('[DEBUG] Processing Ruta Wixarika data:', rutaWixarikaData.features.length, 'features');
                    updateProgress(20 + (processedCount * 60 / totalLayers), 'Procesando ruta Wixarika…');
                    const rutaWixarikaResult = clipLayer(rutaWixarikaData, "Name",
                        { style: { color: '#ff8000', weight: 2, fillOpacity: 0.1 } },
                        p => createPopupContent('Ruta Wixarika', '🛤️', [
                            { value: p.Name || 'Sin nombre', isMain: true }
                        ]), clipArea);
                    console.log('[DEBUG] Ruta Wixarika clipped result:', rutaWixarikaResult.clipped.length, 'features');
                    clippedRutaWixarikaLayer = rutaWixarikaResult.layer.addTo(map);
                    overlaysControl.addOverlay(clippedRutaWixarikaLayer, "Ruta Wixarika");
                    layersData.rutaWixarika = { features: rutaWixarikaResult.clipped };
                    processedCount++;
                } else {
                    console.log('[DEBUG] Ruta Wixarika data not available or empty');
                    clippedRutaWixarikaLayer = L.layerGroup().addTo(map);
                    overlaysControl.addOverlay(clippedRutaWixarikaLayer, "Ruta Wixarika");
                }

                updateLayersDisplay(layersData);

                // Ajustar vista del mapa
                const bounds = clipArea ? L.geoJSON(clipArea).getBounds() : kmlLayer.getBounds();
                if (bounds && bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
                    lastAreaBounds = bounds;
                }

                if (resetViewBtn) resetViewBtn.disabled = false;

                updateProgress(100, 'Todas las capas procesadas exitosamente');

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
        // FUNCIONES DE REPORTE EXCEL
        // ====================================================================

        /**
         * Genera y descarga un reporte Excel con todos los datos analizados
         */
        function generateExcelReport() {
            try {
                showAlert('Generando reporte Excel...', 'info', 2000);

                const workbook = XLSX.utils.book_new();

                // Hoja de resumen
                const summaryData = [
                    ['Análisis Geoespacial - Áreas de Interés'],
                    ['Fecha del análisis', new Date().toLocaleString('es-MX')],
                    ['Archivo KML', kmlFileInput?.files[0]?.name || 'No especificado'],
                    ['Tipo de área', areaTypeSelect.options[areaTypeSelect.selectedIndex].text],
                    ['Total elementos encontrados', formatNumber(totalElements)],
                    [],
                    ['Resumen por capas:']
                ];

                // Agregar resumen de cada capa
                Object.entries(layersData).forEach(([layerName, data]) => {
                    if (data.features && data.features.length > 0) {
                        const displayName = getLayerDisplayName(layerName);
                        summaryData.push([displayName, data.features.length + ' elementos']);
                    }
                });

                const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
                XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');

                // Generar hojas para cada capa con datos detallados
                const layerConfigs = {
                    localidades: { property: 'CVEGEO', headers: ['CVEGEO', 'Localidad', 'Municipio', 'Estado', 'Ámbito'] },
                    atlas: { property: 'CVEGEO', headers: ['CVEGEO', 'Localidad', 'Municipio'] },
                    municipios: { property: 'CVEGEO', headers: ['CVEGEO', 'Municipio', 'Estado', 'Cabecera'] },
                    regiones: { property: 'Name', headers: ['Nombre', 'Tipo', 'Descripción'] },
                    ran: { property: 'Clv_Unica', headers: ['Clave', 'Nombre', 'Tipo', 'Estado', 'Municipio'] },
                    lenguas: { property: 'Lengua', headers: ['Lengua', 'Localidad', 'Municipio', 'Estado'] },
                    za_publico: { property: 'Zona Arqueológica', headers: ['Nombre', 'Estado', 'Municipio', 'Localidad'] },
                    za_publico_a: { property: 'Zona Arqueológica', headers: ['Nombre', 'Estado', 'Municipio', 'Localidad'] },
                    anp_estatal: { property: 'NOMBRE', headers: ['Nombre', 'Tipo', 'Categoría DEC', 'Entidad', 'Municipio DEC'] },
                    ramsar: { property: 'RAMSAR', headers: ['Nombre', 'Estado', 'Municipio'] },
                    sitio_arqueologico: { property: 'nombre', headers: ['Nombre', 'Estado', 'Municipio', 'Localidad'] },
                    z_historicos: { property: 'Nombre', headers: ['Nombre', 'Estado', 'Municipio', 'Localidad'] },
                    loc_indigenas_datos: { property: 'CVEGEO', headers: ['CVEGEO', 'Entidad', 'Municipio', 'Localidad', 'Población Total'] },
                    rutaWixarika: { property: 'Name', headers: ['Nombre'] }
                };

                Object.entries(layersData).forEach(([layerName, data]) => {
                    if (data.features && data.features.length > 0) {
                        const config = layerConfigs[layerName];
                        if (config) {
                            const sheetData = [config.headers];

                            data.features.forEach(feature => {
                                const row = [];
                                config.headers.forEach(header => {
                                    let value = '';

                                    // Mapear headers a propiedades reales
                                    switch (header) {
                                        case 'CVEGEO':
                                            value = feature.properties.CVEGEO || '';
                                            break;
                                        case 'Localidad':
                                            value = feature.properties.NOM_LOC || feature.properties.nom_loc || feature.properties.LOCALIDAD || '';
                                            break;
                                        case 'Municipio':
                                            value = feature.properties.NOM_MUN || feature.properties.nom_mun || feature.properties.MUNICIPIO || feature.properties.MUNICIPIOS || '';
                                            break;
                                        case 'Estado':
                                            value = feature.properties.NOM_ENT || feature.properties.nom_ent || feature.properties.ESTADO || '';
                                            break;
                                        case 'Ámbito':
                                            value = feature.properties.AMBITO || '';
                                            break;
                                        case 'Cabecera':
                                            value = feature.properties.NOM_CAB || feature.properties.CABECERA || '';
                                            break;
                                        case 'Nombre':
                                            value = feature.properties[config.property] || feature.properties.NOMBRE || '';
                                            break;
                                        case 'Tipo':
                                            value = feature.properties.TIPO || feature.properties.Tipo || '';
                                            break;
                                        case 'Descripción':
                                            value = feature.properties.Descripci || feature.properties.DESCRIPCION || '';
                                            break;
                                        case 'Clave':
                                            value = feature.properties.Clv_Unica || '';
                                            break;
                                        case 'Categoría DEC':
                                            value = feature.properties.CAT_DEC || '';
                                            break;
                                        case 'Entidad':
                                            value = feature.properties.ENTIDAD || '';
                                            break;
                                        case 'Municipio DEC':
                                            value = feature.properties.MUN_DEC || '';
                                            break;
                                        default:
                                            value = feature.properties[header] || '';
                                    }

                                    row.push(value);
                                });

                                sheetData.push(row);
                            });

                            const sheet = XLSX.utils.aoa_to_sheet(sheetData);
                            const displayName = getLayerDisplayName(layerName);
                            XLSX.utils.book_append_sheet(workbook, sheet, displayName.substring(0, 31)); // Excel limita nombres de hoja a 31 caracteres
                        }
                    }
                });

                // Descargar archivo
                const fileName = `reporte_analisis_${new Date().toISOString().split('T')[0]}.xlsx`;
                XLSX.writeFile(workbook, fileName);

                showAlert(`Reporte Excel generado exitosamente: ${fileName}`, 'success', 4000);

            } catch (error) {
                console.error('Error generando reporte Excel:', error);
                showAlert('Error al generar el reporte Excel. Intenta nuevamente.', 'danger', 4000);
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
                zaPublicoData = null;
                zaPublicoAData = null;
                anpEstatalData = null;
                ramsarData = null;
                sitioArqueologicoData = null;
                zHistoricosData = null;
                locIndigenasData = null;
                rutaWixarikaData = null;
                localidadesDatosData = null;

                // Reintentar carga
                showAlert('Reintentando carga de datos...', 'info', 3000);
                loadDataOptional();
            });
        }

        // Descargar reporte Excel
        const downloadReportBtn = document.getElementById('downloadReportBtn');
        if (downloadReportBtn) {
            downloadReportBtn.addEventListener('click', generateExcelReport);
        }

    } catch (error) {
        console.error('Error inicializando aplicación:', error);
        console.log('[DEBUG] Error in initApp, about to show error alert');
        showAlert('Error al inicializar la aplicación. Recarga la página.', 'danger', 8000);
    }
    console.log('[DEBUG] initApp completed');
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}