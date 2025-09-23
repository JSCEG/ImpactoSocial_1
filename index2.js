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

// Métricas del KML para reportes
let kmlMetrics = {
    area: 0, // en km²
    perimeter: 0, // en km
    geometryType: 'N/A',
    bufferUsed: false,
    bufferRadius: 0,
    localityDensity: 0, // localidades por km²
    populationDensity: 0, // población por km²
    totalPopulation: 0, // población total intersectada
    intersectsANP: false,
    intersectsRamsar: false,
    intersectsZHistoricas: false,
    intersectsZA: false
};

// ============================================================================
// UTILIDADES Y VARIABLES DE DATOS
// ============================================================================

// Función para formatear números con separadores de miles
function formatNumber(n) {
    if (n == null || isNaN(n)) return '0';
    try { return n.toLocaleString('es-MX'); } catch (_) { return String(n); }
}

// Función para corregir problemas de encoding (mojibake) comunes en español
function fixMojibake(text) {
    if (!text || typeof text !== 'string') return text;

    // Mapa de caracteres comunes mal codificados (Windows-1252 interpretado como UTF-8)
    const fixes = {
        'Ã¡': 'á', 'Ã©': 'é', 'Ã­': 'í', 'Ã³': 'ó', 'Ãº': 'ú',
        'Ã±': 'ñ', 'Ã¼': 'ü',
        'Ã': 'Á', 'Ã‰': 'É', 'Ã': 'Í', 'Ã“': 'Ó', 'Ãš': 'Ú',
        'Ã‘': 'Ñ', 'Ãœ': 'Ü',
        'Â¿': '¿', 'Â¡': '¡',
        'â‚¬': '€', 'â€š': '‚', 'â€ž': '„', 'â€¦': '…', 'â€°': '‰',
        'â€¹': '‹', 'â€º': '›', 'â€': '†', 'â€': '‡', 'â€': '•',
        'â€': '–', 'â€”': '—', 'â€': '˜', 'â„¢': '™', 'â€': 'š',
        'â€': '›', 'â€': 'œ', 'â€': 'ž', 'â€': 'Ÿ'
    };

    let fixed = text;
    Object.entries(fixes).forEach(([wrong, right]) => {
        fixed = fixed.replace(new RegExp(wrong, 'g'), right);
    });

    return fixed;
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
                    console.log('[DEBUG] Localidades merged properties sample:', localitiesData.features[0]?.properties);
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
                    },
                    onEachFeature: function (feature, layer) {
                        const props = feature.properties;
                        let popupContent;
                        if (layerName === 'localidades') {
                            popupContent = createPopupContent('Localidad', '🏘️', [
                                { value: props.NOMGEO || props.NOM_LOC || props.NOMBRE || 'Sin nombre', isMain: true },
                                { label: 'CVEGEO', value: props.CVEGEO },
                                { label: 'Municipio', value: props.NOM_MUN || props.MUNICIPIO },
                                { label: 'Estado', value: props.NOM_ENT || props.ESTADO },
                                { label: 'Ámbito', value: props.AMBITO },
                                { label: 'Población Total', value: props.POBTOT },
                                { label: 'Población Femenina', value: props.POBFEM },
                                { label: 'Población Masculina', value: props.POBMAS }
                            ]);
                        } else if (layerName === 'atlas') {
                            popupContent = createPopupContent('Atlas Pueblos Indígenas', '🏛️', [
                                { value: props.CVEGEO, isMain: true },
                                { label: 'Localidad', value: props.NOM_LOC || props.NOMBRE },
                                { label: 'Municipio', value: props.NOM_MUN || props.MUNICIPIO }
                            ]);
                        } else if (layerName === 'municipios') {
                            popupContent = createPopupContent('Municipio', '🏛️', [
                                { value: props.NOMGEO || props.NOM_MUN || props.NOMBRE || 'Sin nombre', isMain: true },
                                { label: 'CVEGEO', value: props.CVEGEO },
                                { label: 'Estado', value: props.NOM_ENT || props.ESTADO },
                                { label: 'Cabecera', value: props.NOM_CAB || props.CABECERA }
                            ]);
                        } else if (layerName === 'regiones') {
                            popupContent = createPopupContent('Región Indígena', '🌄', [
                                { value: props.Name || props.NOMBRE || 'Sin nombre', isMain: true },
                                { label: 'Tipo', value: props.Tipo || props.TIPO },
                                { label: 'Descripción', value: props.Descripci || props.DESCRIPCION }
                            ]);
                        } else if (layerName === 'ran') {
                            popupContent = createPopupContent('RAN', '🌾', [
                                { value: props.MUNICIPIO || props.Clv_Unica, isMain: true },
                                { label: 'Clv_Unica', value: props.Clv_Unica },
                                { label: 'Tipo', value: props.tipo || props.Tipo },
                                { label: 'Estado', value: props.Estado || props.ESTADO },
                                { label: 'Municipio', value: props.Municipio || props.MUNICIPIO }
                            ]);
                        } else if (layerName === 'lenguas') {
                            popupContent = createPopupContent('Lengua Indígena', '🗣️', [
                                { value: props.Lengua || props.LENGUA || 'Sin especificar', isMain: true },
                                { label: 'Localidad', value: props.NOM_LOC || props.LOCALIDAD },
                                { label: 'Municipio', value: props.NOM_MUN || props.MUNICIPIO },
                                { label: 'Estado', value: props.NOM_ENT || props.ESTADO }
                            ]);
                        } else if (layerName === 'za_publico') {
                            popupContent = createPopupContent('ZA Público', '🏞️', [
                                { value: props["Zona Arqueológica"] || 'Sin nombre', isMain: true },
                                { label: 'Estado', value: props.ESTADO },
                                { label: 'Municipio', value: props.MUNICIPIO },
                                { label: 'Localidad', value: props.LOCALIDAD }
                            ]);
                        } else if (layerName === 'za_publico_a') {
                            popupContent = createPopupContent('ZA Público A', '🏞️', [
                                { value: props["Zona Arqueológica"] || 'Sin nombre', isMain: true },
                                { label: 'Estado', value: props.ESTADO },
                                { label: 'Municipio', value: props.MUNICIPIO },
                                { label: 'Localidad', value: props.LOCALIDAD }
                            ]);
                        } else if (layerName === 'anp_estatal') {
                            popupContent = createPopupContent('ANP Estatal', '🌿', [
                                { value: props.NOMBRE || 'Sin nombre', isMain: true },
                                { label: 'Tipo', value: props.TIPO },
                                { label: 'Categoría DEC', value: props.CAT_DEC },
                                { label: 'Entidad', value: props.ENTIDAD },
                                { label: 'Municipio DEC', value: props.MUN_DEC }
                            ]);
                        } else if (layerName === 'ramsar') {
                            popupContent = createPopupContent('Sitio Ramsar', '🦆', [
                                { value: props.RAMSAR || 'Sin nombre', isMain: true },
                                { label: 'Estado', value: props.ESTADO },
                                { label: 'Municipio', value: props.MUNICIPIOS }
                            ]);
                        } else if (layerName === 'sitio_arqueologico') {
                            popupContent = createPopupContent('Sitio Arqueológico', '🏛️', [
                                { value: props.nombre || 'Sin nombre', isMain: true },
                                { label: 'Estado', value: props.nom_ent },
                                { label: 'Municipio', value: props.nom_mun },
                                { label: 'Localidad', value: props.nom_loc }
                            ]);
                        } else if (layerName === 'z_historicos') {
                            popupContent = createPopupContent('Zona Histórica', '🏰', [
                                { value: props.Nombre || 'Sin nombre', isMain: true },
                                { label: 'Estado', value: props.ESTADO },
                                { label: 'Municipio', value: props.MUNICIPIO },
                                { label: 'Localidad', value: props.LOCALIDAD }
                            ]);
                        } else if (layerName === 'loc_indigenas_datos') {
                            popupContent = createPopupContent('Loc Indígenas Datos', '🏘️', [
                                { value: props.LOCALIDAD || 'Sin Localidad', isMain: true },
                                { label: 'Entidad', value: props.ENTIDAD },
                                { label: 'Municipio', value: props.MUNICIPIO },
                                { label: 'Localidad', value: props.LOCALIDAD },
                                { label: 'Población Total', value: props.POBTOTAL }
                            ]);
                        } else if (layerName === 'rutaWixarika') {
                            popupContent = createPopupContent('Ruta Wixarika', '🛤️', [
                                { value: props.Name || 'Sin nombre', isMain: true }
                            ]);
                        } else {
                            // Generic popup for other layers
                            popupContent = `<h6>${props[propertyName] || 'Sin nombre'}</h6>`;
                        }
                        layer.bindPopup(popupContent);
                        // Only open popup for single features to avoid clutter
                        if (targetFeatures.length === 1) {
                            layer.openPopup();
                        }
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
                    let displayName = featureId;
                    if (layerName === 'localidades' && targetFeatures.length === 1) {
                        const name = targetFeatures[0].properties.NOMGEO || targetFeatures[0].properties.NOM_LOC || 'Sin nombre';
                        displayName = `${name} (${featureId})`;
                    } else if (layerName === 'atlas' && targetFeatures.length === 1) {
                        const name = targetFeatures[0].properties.Localidad || 'Sin localidad';
                        displayName = `${name} (${featureId})`;
                    } else if (layerName === 'municipios' && targetFeatures.length === 1) {
                        const name = targetFeatures[0].properties.NOMGEO || targetFeatures[0].properties.NOM_MUN || 'Sin municipio';
                        displayName = `${name} (${featureId})`;
                    } else if (layerName === 'ran' && targetFeatures.length === 1) {
                        const name = targetFeatures[0].properties.MUNICIPIO || 'Sin municipio';
                        displayName = `${name} (${featureId})`;
                    }
                    if (targetFeatures.length === 1) {
                        showAlert(`📍 Navegando a: ${displayName}`, 'info', 2000);
                    } else {
                        showAlert(`📍 Navegando a ${targetFeatures.length} puntos de: ${displayName}`, 'info', 2000);
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

                    header.innerHTML = `${title} <span class="badge bg-secondary">${formatNumber(sortedLenguas.length)} únicas</span>`;

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
                    header.innerHTML = `${title} <span class="badge bg-secondary">${formatNumber(features.length)}</span>`;

                    features.forEach((f, index) => {
                        if (f.properties[propertyName]) {
                            const li = document.createElement('li');
                            // For localities, atlas, and municipios, show name and key instead of just key
                            let displayText = f.properties[propertyName];
                            if (layerName === 'localidades') {
                                const name = f.properties.NOMGEO || f.properties.NOM_LOC || 'Sin nombre';
                                const key = f.properties.CVEGEO;
                                displayText = `${name} (${key})`;
                            } else if (layerName === 'atlas') {
                                const name = f.properties.Localidad || 'Sin localidad';
                                const key = f.properties.CVEGEO;
                                displayText = `${name} (${key})`;
                            } else if (layerName === 'municipios') {
                                const name = f.properties.NOMGEO || f.properties.NOM_MUN || 'Sin municipio';
                                const key = f.properties.CVEGEO;
                                displayText = `${name} (${key})`;
                            } else if (layerName === 'ran') {
                                const name = f.properties.MUNICIPIO || 'Sin municipio';
                                const key = f.properties.Clv_Unica;
                                displayText = `${name} (${key})`;
                            }
                            li.innerHTML = `<span class="color-dot" style="background:${color}"></span>${displayText}`;
                            li.dataset.featureId = f.properties[propertyName];
                            li.dataset.layerName = layerName;
                            li.setAttribute('role', 'button');
                            li.setAttribute('tabindex', '0');
                            li.setAttribute('aria-label', `${displayText} - Clic para navegar`);

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

            // Habilitar/deshabilitar botones de descarga
            const downloadReportBtn = document.getElementById('downloadReportBtn');
            const downloadPdfBtn = document.getElementById('downloadPdfBtn');
            if (downloadReportBtn) {
                downloadReportBtn.disabled = totalElements === 0;
            }
            if (downloadPdfBtn) {
                downloadPdfBtn.disabled = totalElements === 0;
            }

            // Mostrar/ocultar contenedor de gráficos
            const chartsContainer = document.getElementById('chartsContainer');
            if (chartsContainer) {
                if (totalElements > 0) {
                    chartsContainer.style.display = 'block';
                    generateCharts(layersData);
                } else {
                    chartsContainer.style.display = 'none';
                }
            }
        }

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

            const layerNames = {
                localidades: 'Localidades',
                atlas: 'Atlas Pueblos Indígenas',
                municipios: 'Municipios',
                regiones: 'Regiones Indígenas',
                ran: 'RAN',
                lenguas: 'Lenguas Indígenas',
                za_publico: 'ZA Público',
                za_publico_a: 'ZA Público A',
                anp_estatal: 'ANP Estatales',
                ramsar: 'Ramsar',
                sitio_arqueologico: 'Sitios Arqueológicos',
                z_historicos: 'Zonas Históricas',
                loc_indigenas_datos: 'Loc Indígenas Datos',
                rutaWixarika: 'Ruta Wixarika'
            };

            Object.entries(layersData).forEach(([layerName, data]) => {
                if (data.features && data.features.length > 0) {
                    const count = layerName === 'lenguas' ?
                        new Set(data.features.map(f => f.properties.Lengua || f.properties.LENGUA)).size :
                        data.features.length;

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
                    name: f.properties.NOMGEO || f.properties.NOM_LOC || 'Sin nombre',
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

            // Deshabilitar botones de descarga
            const downloadReportBtn = document.getElementById('downloadReportBtn');
            const downloadPdfBtn = document.getElementById('downloadPdfBtn');
            if (downloadReportBtn) {
                downloadReportBtn.disabled = true;
            }
            if (downloadPdfBtn) {
                downloadPdfBtn.disabled = true;
            }

            // Ocultar gráficos
            const chartsContainer = document.getElementById('chartsContainer');
            if (chartsContainer) {
                chartsContainer.style.display = 'none';
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

                    // Calcular métricas del KML
                    kmlMetrics.geometryType = kmlPolygon.geometry.type;
                    try {
                        kmlMetrics.area = turf.area(kmlPolygon) / 1000000; // Convertir a km²
                        kmlMetrics.perimeter = turf.length(kmlPolygon, { units: 'kilometers' });
                    } catch (error) {
                        console.warn('Error calculando métricas del KML:', error);
                        kmlMetrics.area = 0;
                        kmlMetrics.perimeter = 0;
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
                    let displayValue = field.value;
                    // Apply thousands separator to population numbers
                    if (field.label && (field.label.includes('Población') || field.label.includes('POBTOTAL')) && !isNaN(field.value)) {
                        displayValue = formatNumber(field.value);
                    }
                    if (field.isMain) {
                        content += `<strong>${displayValue}</strong><br>`;
                    } else {
                        content += `<small><strong>${field.label}:</strong> ${displayValue}</small><br>`;
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

                // Crear buffer según el tipo de área seleccionado
                if (areaTypeSelect.value === 'nucleo') {
                    // Área núcleo: buffer de 500m alrededor del polígono
                    try {
                        updateProgress(15, 'Generando buffer de 500m para área núcleo…');
                        clipArea = turf.buffer(kmlPolygon, 0.5, { units: 'kilometers' });

                        if (bufferLayer) map.removeLayer(bufferLayer);
                        bufferLayer = L.geoJSON(clipArea, {
                            style: { color: '#0078ff', weight: 2, fillColor: '#0078ff', fillOpacity: 0.1 }
                        }).addTo(map);

                        lastAreaBounds = L.geoJSON(clipArea).getBounds();

                        // Actualizar métricas del buffer
                        kmlMetrics.bufferUsed = true;
                        kmlMetrics.bufferRadius = 0.5;
                    } catch (err) {
                        console.error("Error creando buffer:", err);
                        showAlert("No se pudo crear el buffer de 500m.", 'danger');
                        hidePreloader();
                        return;
                    }
                } else if (areaTypeSelect.value === 'exacta') {
                    // Área exacta: usar el polígono original sin buffer
                    updateProgress(15, 'Usando área exacta del polígono…');
                    clipArea = kmlPolygon;
                    kmlMetrics.bufferUsed = false;
                    kmlMetrics.bufferRadius = 0;
                } else {
                    // Área de influencia directa/indirecta: por ahora usar polígono original
                    // (puede implementarse lógica específica en el futuro)
                    updateProgress(15, `Procesando área de influencia ${areaTypeSelect.value === 'directa' ? 'directa' : 'indirecta'}…`);
                    clipArea = kmlPolygon;
                    kmlMetrics.bufferUsed = false;
                    kmlMetrics.bufferRadius = 0;
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
                            { value: p.NOMGEO || p.NOM_LOC || p.NOMBRE || 'Sin nombre', isMain: true },
                            { label: 'CVEGEO', value: p.CVEGEO },
                            { label: 'Municipio', value: p.NOM_MUN || p.MUNICIPIO },
                            { label: 'Estado', value: p.NOM_ENT || p.ESTADO },
                            { label: 'Ámbito', value: p.AMBITO },
                            { label: 'Población Total', value: p.POBTOT },
                            { label: 'Población Femenina', value: p.POBFEM },
                            { label: 'Población Masculina', value: p.POBMAS }
                        ]), clipArea);
                    clippedLocalitiesLayer = locResult.layer.addTo(map);
                    overlaysControl.addOverlay(clippedLocalitiesLayer, "Localidades");
                    layersData.localidades = { features: locResult.clipped };
                    console.log('[DEBUG] Localidades clipped properties sample:', locResult.clipped[0]?.properties);

                    // Calcular densidades
                    const totalLocalities = locResult.clipped.length;
                    let totalPopulation = 0;
                    locResult.clipped.forEach(f => {
                        const pop = f.properties.POBTOT || f.properties.POBTOTAL || 0;
                        totalPopulation += pop;
                    });

                    kmlMetrics.localityDensity = kmlMetrics.area > 0 ? totalLocalities / kmlMetrics.area : 0;
                    kmlMetrics.populationDensity = kmlMetrics.area > 0 ? totalPopulation / kmlMetrics.area : 0;
                    kmlMetrics.totalPopulation = totalPopulation;

                    processedCount++;
                }

                if (atlasData && atlasData.features) {
                    updateProgress(20 + (processedCount * 60 / totalLayers), 'Procesando atlas pueblos indígenas…');
                    const atlasResult = clipLayer(atlasData, "CVEGEO",
                        { pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 5, fillColor: '#ff00ff', color: '#000', weight: 1, opacity: 1, fillOpacity: 0.8 }) },
                        p => createPopupContent('Atlas Pueblos Indígenas', '🏛️', [
                            { value: p.Localidad || p.CVEGEO, isMain: true },
                            { label: 'CVEGEO', value: p.CVEGEO },
                            { label: 'Municipio', value: p.NOM_MUN || p.MUNICIPIO }
                        ]), clipArea);
                    clippedAtlasLayer = atlasResult.layer.addTo(map);
                    overlaysControl.addOverlay(clippedAtlasLayer, "Atlas Pueblos Indígenas");
                    layersData.atlas = { features: atlasResult.clipped };
                    console.log('[DEBUG] Atlas clipped properties sample:', atlasResult.clipped[0]?.properties);
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
                            { value: p.NOMGEO || p.NOM_MUN || p.NOMBRE || p.MUNICIPIO || 'Sin nombre', isMain: true },
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
                            { value: p.MUNICIPIO || p.Clv_Unica, isMain: true },
                            { label: 'Clv_Unica', value: p.Clv_Unica },
                            { label: 'Tipo', value: p.tipo || p.Tipo },
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
                    console.log('[DEBUG] Lenguas clipped properties sample:', lenguasResult.clipped[0]?.properties);
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
                    if (zaPublicoResult.clipped.length > 0) kmlMetrics.intersectsZA = true;
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
                    if (zaPublicoAResult.clipped.length > 0) kmlMetrics.intersectsZA = true;
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
                    if (anpEstatalResult.clipped.length > 0) kmlMetrics.intersectsANP = true;
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
                    if (ramsarResult.clipped.length > 0) kmlMetrics.intersectsRamsar = true;
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
                    if (zHistoricosResult.clipped.length > 0) kmlMetrics.intersectsZHistoricas = true;
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
                            { value: p.LOCALIDAD || 'Sin Localidad', isMain: true },
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
                        const displayName = fixMojibake(getLayerDisplayName(layerName));
                        let count = data.features.length;
                        if (layerName === 'lenguas') {
                            // Para lenguas, contar únicas
                            const uniqueLenguas = new Set();
                            data.features.forEach(f => {
                                if (f.properties.Lengua || f.properties.LENGUA) {
                                    uniqueLenguas.add(f.properties.Lengua || f.properties.LENGUA);
                                }
                            });
                            count = uniqueLenguas.size;
                        }
                        summaryData.push([displayName, count + ' elementos']);
                    }
                });

                const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
                XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');

                // Generar hojas para cada capa con datos detallados
                const layerConfigs = {
                    localidades: { property: 'CVEGEO', headers: ['CVEGEO', 'Localidad', 'Municipio', 'Estado', 'Ámbito', 'Población Total', 'Población Femenina', 'Población Masculina'] },
                    atlas: { property: 'CVEGEO', headers: ['CVEGEO', 'Localidad', 'Municipio'] },
                    municipios: { property: 'CVEGEO', headers: ['CVEGEO', 'Municipio', 'Estado', 'Cabecera'] },
                    regiones: { property: 'Name', headers: ['Nombre', 'Tipo', 'Descripción'] },
                    ran: { property: 'Clv_Unica', headers: ['Clv_Unica', 'Municipio', 'Tipo', 'Estado', 'Municipio'] },
                    lenguas: { property: 'Lengua', headers: ['Lengua', 'Localidad', 'Municipio', 'Estado'] },
                    za_publico: { property: 'Zona Arqueológica', headers: ['Nombre', 'Estado', 'Municipio', 'Localidad'] },
                    za_publico_a: { property: 'Zona Arqueológica', headers: ['Nombre', 'Estado', 'Municipio', 'Localidad'] },
                    anp_estatal: { property: 'NOMBRE', headers: ['Nombre', 'Tipo', 'Categoría DEC', 'Entidad', 'Municipio DEC'] },
                    ramsar: { property: 'RAMSAR', headers: ['Nombre', 'Estado', 'Municipio'] },
                    sitio_arqueologico: { property: 'nombre', headers: ['Nombre', 'Estado', 'Municipio', 'Localidad'] },
                    z_historicos: { property: 'Nombre', headers: ['Nombre', 'Estado', 'Municipio', 'Localidad'] },
                    loc_indigenas_datos: { property: 'LOCALIDAD', headers: ['Entidad', 'Municipio', 'Localidad', 'Población Total', 'PIHOGARES', 'pPIHOGARES', 'TIPOLOC_PI', 'POB_AFRO', 'pPOB_AFRO', 'TIPOLOC_AF', 'cve_ent', 'cve_mun', 'cve_loc', 'cvegeo'] },
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

                                    // Map friendly headers to actual properties
                                    switch (header) {
                                        case 'CVEGEO':
                                            value = feature.properties.CVEGEO || '';
                                            break;
                                        case 'Localidad':
                                            value = feature.properties.NOMGEO || feature.properties.NOM_LOC || feature.properties.nom_loc || feature.properties.LOCALIDAD || '';
                                            break;
                                        case 'Municipio':
                                            value = feature.properties.NOMGEO || feature.properties.NOM_MUN || feature.properties.nom_mun || feature.properties.MUNICIPIO || feature.properties.MUNICIPIOS || '';
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
                                        case 'Población Total':
                                            value = feature.properties.POBTOT || feature.properties.POBTOTAL || '';
                                            break;
                                        case 'Población Femenina':
                                            value = feature.properties.POBFEM || '';
                                            break;
                                        case 'Población Masculina':
                                            value = feature.properties.POBMAS || '';
                                            break;
                                        case 'Nombre':
                                            value = feature.properties[config.property] || feature.properties.NOMBRE || feature.properties.nombre || feature.properties.Name || '';
                                            break;
                                        case 'Tipo':
                                            value = feature.properties.TIPO || feature.properties.Tipo || feature.properties.tipo || '';
                                            break;
                                        case 'Descripción':
                                            value = feature.properties.Descripci || feature.properties.DESCRIPCION || '';
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
                                        case 'Clv_Unica':
                                            value = feature.properties.Clv_Unica || '';
                                            break;
                                        case 'Lengua':
                                            value = feature.properties.Lengua || feature.properties.LENGUA || '';
                                            break;
                                        case 'Zona Arqueológica':
                                            value = feature.properties["Zona Arqueológica"] || '';
                                            break;
                                        case 'RAMSAR':
                                            value = feature.properties.RAMSAR || '';
                                            break;
                                        case 'PIHOGARES':
                                            value = feature.properties.PIHOGARES || '';
                                            break;
                                        case 'pPIHOGARES':
                                            value = feature.properties.pPIHOGARES || '';
                                            break;
                                        case 'TIPOLOC_PI':
                                            value = feature.properties.TIPOLOC_PI || '';
                                            break;
                                        case 'POB_AFRO':
                                            value = feature.properties.POB_AFRO || '';
                                            break;
                                        case 'pPOB_AFRO':
                                            value = feature.properties.pPOB_AFRO || '';
                                            break;
                                        case 'TIPOLOC_AF':
                                            value = feature.properties.TIPOLOC_AF || '';
                                            break;
                                        case 'cve_ent':
                                            value = feature.properties.cve_ent || '';
                                            break;
                                        case 'cve_mun':
                                            value = feature.properties.cve_mun || '';
                                            break;
                                        case 'cve_loc':
                                            value = feature.properties.cve_loc || '';
                                            break;
                                        case 'cvegeo':
                                            value = feature.properties.cvegeo || '';
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

        /**
         * Agrega páginas de análisis detallado por capa al PDF
         */
        async function addDetailedLayerAnalysis(pdf, layersData, primaryColor, secondaryColor, chartImages) {
            const keyLayers = ['lenguas', 'ran', 'ramsar', 'z_historicos', 'sitio_arqueologico'];

            for (const layerName of keyLayers) {
                if (layersData[layerName] && layersData[layerName].features && layersData[layerName].features.length > 0) {
                    pdf.addPage();
                    pdf.setFillColor(247, 244, 242);
                    pdf.rect(0, 0, 210, 297, 'F');

                    const displayName = getLayerDisplayName(layerName);
                    pdf.setTextColor(...primaryColor);
                    pdf.setFontSize(16);
                    pdf.text(`Análisis: ${displayName}`, 20, 30);

                    pdf.setTextColor(0, 0, 0);
                    pdf.setFontSize(12);

                    if (layerName === 'lenguas') {
                        // Análisis de lenguas indígenas
                        const lenguasCount = new Map();
                        layersData.lenguas.features.forEach(f => {
                            if (f.properties.Lengua || f.properties.LENGUA) {
                                const lengua = f.properties.Lengua || f.properties.LENGUA;
                                lenguasCount.set(lengua, (lenguasCount.get(lengua) || 0) + 1);
                            }
                        });

                        pdf.text('Distribución de Lenguas Indígenas:', 20, 50);
                        let yPos = 65;
                        const sortedLenguas = Array.from(lenguasCount.entries()).sort((a, b) => b[1] - a[1]);

                        sortedLenguas.slice(0, 15).forEach(([lengua, count]) => {
                            pdf.text(`${lengua}: ${count} puntos`, 25, yPos);
                            yPos += 8;
                        });

                        if (sortedLenguas.length > 15) {
                            pdf.text(`... y ${sortedLenguas.length - 15} lenguas más`, 25, yPos);
                        }

                    } else if (layerName === 'ran') {
                        // Análisis de RAN - agrupar por nombre único y mostrar conteos
                        const ranCount = new Map();
                        const ranKeys = new Map(); // Para almacenar claves únicas por RAN

                        layersData.ran.features.forEach(f => {
                            const nombre = f.properties.MUNICIPIO || f.properties.Clv_Unica || 'Sin nombre';
                            const clave = f.properties.Clv_Unica || 'Sin clave';

                            if (!ranCount.has(nombre)) {
                                ranCount.set(nombre, 0);
                                ranKeys.set(nombre, new Set());
                            }
                            ranCount.set(nombre, ranCount.get(nombre) + 1);
                            ranKeys.get(nombre).add(clave);
                        });

                        pdf.text('Núcleos Agrarios Nacionales (RAN) - Elementos únicos:', 20, 50);
                        let yPos = 65;
                        const sortedRan = Array.from(ranCount.entries()).sort((a, b) => b[1] - a[1]);

                        // Mostrar tabla de RAN únicos
                        pdf.setFontSize(10);
                        pdf.text('RAN', 25, yPos);
                        pdf.text('Conteo', 120, yPos);
                        pdf.text('Claves', 150, yPos);
                        yPos += 5;
                        pdf.line(25, yPos, 185, yPos); // Línea separadora
                        yPos += 5;

                        sortedRan.slice(0, 12).forEach(([ran, count]) => {
                            const keys = Array.from(ranKeys.get(ran)).join(', ');
                            const truncatedKeys = keys.length > 25 ? keys.substring(0, 22) + '...' : keys;

                            pdf.text(ran.length > 20 ? ran.substring(0, 17) + '...' : ran, 25, yPos);
                            pdf.text(count.toString(), 125, yPos);
                            pdf.text(truncatedKeys, 150, yPos);
                            yPos += 6;
                        });

                        pdf.setFontSize(12);
                        if (sortedRan.length > 12) {
                            pdf.text(`... y ${sortedRan.length - 12} RAN únicos más`, 25, yPos);
                        }

                        // Nota sobre total de elementos
                        yPos += 10;
                        pdf.setFontSize(10);
                        pdf.text(`* Total de elementos RAN analizados: ${layersData.ran.features.length}`, 25, yPos);
                        pdf.text(`* Elementos únicos por nombre: ${sortedRan.length}`, 25, yPos + 6);

                    } else if (layerName === 'ramsar') {
                        // Análisis de Ramsar
                        pdf.text('Sitios Ramsar:', 20, 50);
                        let yPos = 65;
                        layersData.ramsar.features.forEach(f => {
                            const nombre = f.properties.RAMSAR || 'Sin nombre';
                            const estado = f.properties.ESTADO || '';
                            const municipio = f.properties.MUNICIPIOS || '';
                            pdf.text(`• ${nombre} (${estado}, ${municipio})`, 25, yPos);
                            yPos += 8;
                        });

                    } else if (layerName === 'z_historicos') {
                        // Análisis de zonas históricas
                        pdf.text('Zonas Históricas:', 20, 50);
                        let yPos = 65;
                        layersData.z_historicos.features.slice(0, 15).forEach(f => {
                            const nombre = f.properties.Nombre || 'Sin nombre';
                            const estado = f.properties.ESTADO || '';
                            const municipio = f.properties.MUNICIPIO || '';
                            pdf.text(`• ${nombre}`, 25, yPos);
                            pdf.setFontSize(10);
                            pdf.text(`  ${estado}, ${municipio}`, 30, yPos + 5);
                            pdf.setFontSize(12);
                            yPos += 12;
                        });

                        if (layersData.z_historicos.features.length > 15) {
                            pdf.text(`... y ${layersData.z_historicos.features.length - 15} más`, 25, yPos);
                        }

                    } else if (layerName === 'sitio_arqueologico') {
                        // Análisis de sitios arqueológicos
                        pdf.text('Sitios Arqueológicos:', 20, 50);
                        let yPos = 65;
                        layersData.sitio_arqueologico.features.slice(0, 15).forEach(f => {
                            const nombre = f.properties.nombre || 'Sin nombre';
                            const estado = f.properties.nom_ent || '';
                            const municipio = f.properties.nom_mun || '';
                            pdf.text(`• ${nombre}`, 25, yPos);
                            pdf.setFontSize(10);
                            pdf.text(`  ${estado}, ${municipio}`, 30, yPos + 5);
                            pdf.setFontSize(12);
                            yPos += 12;
                        });

                        if (layersData.sitio_arqueologico.features.length > 15) {
                            pdf.text(`... y ${layersData.sitio_arqueologico.features.length - 15} más`, 25, yPos);
                        }
                    }
                }
            }
        }

        /**
         * Genera y descarga un reporte PDF completo con gráficos y datos
         */
        async function generatePdfReport() {
            try {
                showPreloader();
                updateProgress(0, 'Preparando datos del reporte...');

                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF('p', 'mm', 'a4');

                // Configuración de colores institucionales
                const primaryColor = [124, 25, 70]; // RGB para #7C1946
                const secondaryColor = [25, 126, 116]; // RGB para #197E74

                // Inicializar contenedor de imágenes de gráficos
                let chartImages = {};

                updateProgress(5, 'Generando gráficos...');

                // Asegurar que los gráficos estén generados antes de capturar
                generateCharts(layersData);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar renderizado

                updateProgress(10, 'Generando portada...');

                // Calcular páginas del índice
                const tocPages = [
                    { title: 'Portada', page: 1 },
                    { title: 'Índice', page: 2 },
                    { title: 'Resumen Ejecutivo', page: 3 }
                ];

                let currentPage = 4; // Después de portada, índice y resumen

                if (layersData.localidades && layersData.localidades.features && layersData.localidades.features.length > 0) {
                    tocPages.push({ title: 'Análisis de Localidades', page: currentPage++ });
                }

                // Agregar página para cada capa
                const allLayers = [
                    'localidades', 'atlas', 'municipios', 'regiones', 'ran',
                    'lenguas', 'za_publico', 'za_publico_a', 'anp_estatal',
                    'ramsar', 'sitio_arqueologico', 'z_historicos', 'loc_indigenas_datos', 'rutaWixarika'
                ];

                const layerTitles = {
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

                allLayers.forEach(layerName => {
                    tocPages.push({ title: layerTitles[layerName], page: currentPage++ });
                });

                // Agregar páginas de análisis detallado adicionales si existen
                const keyLayers = ['lenguas', 'ran', 'ramsar', 'z_historicos', 'sitio_arqueologico'];
                keyLayers.forEach(layerName => {
                    if (layersData[layerName] && layersData[layerName].features && layersData[layerName].features.length > 0) {
                        const displayName = getLayerDisplayName(layerName);
                        tocPages.push({ title: `Análisis: ${displayName}`, page: currentPage++ });
                    }
                });

                tocPages.push({ title: 'Vista del Mapa', page: currentPage });

                // Página 1: Portada
                pdf.setFillColor(...primaryColor);
                pdf.rect(0, 0, 210, 297, 'F');

                // Logos institucionales
                try {
                    // Logo Gobierno de México (tamaño reducido)
                    pdf.addImage('img/logo_gob.png', 'PNG', 20, 20, 30, 23);
                    // Logo SENER (tamaño reducido)
                    pdf.addImage('img/logo_sener.png', 'PNG', 160, 20, 30, 23);
                } catch (logoError) {
                    console.warn('Error cargando logos:', logoError);
                }

                // Logo y título
                pdf.setTextColor(255, 255, 255);
                pdf.setFontSize(24);
                pdf.text('Evaluación de Proyecto KML', 105, 80, { align: 'center' });

                pdf.setFontSize(16);
                pdf.text('Geovisualizador de Áreas de Interés', 105, 100, { align: 'center' });

                // Información del proyecto
                pdf.setFontSize(12);
                const currentDate = new Date().toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                pdf.text(`Fecha: ${currentDate}`, 105, 130, { align: 'center' });
                pdf.text(`Archivo KML: ${kmlFileInput?.files[0]?.name || 'No especificado'}`, 105, 145, { align: 'center' });
                pdf.text(`Tipo de área: ${areaTypeSelect.options[areaTypeSelect.selectedIndex].text}`, 105, 160, { align: 'center' });

                // Mostrar métricas del KML
                pdf.setFontSize(10);
                pdf.text(`Área KML: ${formatNumber(kmlMetrics.area)} km²`, 105, 175, { align: 'center' });
                pdf.text(`Perímetro: ${formatNumber(kmlMetrics.perimeter)} km`, 105, 182, { align: 'center' });
                pdf.text(`Geometría: ${kmlMetrics.geometryType}`, 105, 189, { align: 'center' });
                if (kmlMetrics.bufferUsed) {
                    pdf.text(`Buffer: ${kmlMetrics.bufferRadius} km añadido`, 105, 196, { align: 'center' });
                }
                pdf.setFontSize(12);

                // Página 2: Índice
                pdf.addPage();
                pdf.setFillColor(255, 255, 255);
                pdf.rect(0, 0, 210, 297, 'F');

                pdf.setTextColor(...primaryColor);
                pdf.setFontSize(18);
                pdf.text('Índice', 20, 30);

                pdf.setTextColor(0, 0, 0);
                pdf.setFontSize(12);
                pdf.text('Contenido del Reporte:', 20, 50);

                pdf.setFontSize(11);
                let tocY = 70;
                tocPages.forEach(item => {
                    // Justificación: título a la izquierda, número de página a la derecha
                    pdf.text(item.title, 25, tocY);
                    pdf.text(item.page.toString(), 180, tocY);
                    tocY += 8;
                });

                updateProgress(20, 'Generando resumen ejecutivo...');

                // Página 2: Resumen Ejecutivo
                pdf.addPage();
                pdf.setFillColor(247, 244, 242); // #F7F4F2
                pdf.rect(0, 0, 210, 297, 'F');

                pdf.setTextColor(...primaryColor);
                pdf.setFontSize(18);
                pdf.text('Resumen Ejecutivo', 20, 30);

                pdf.setTextColor(0, 0, 0);
                pdf.setFontSize(12);
                pdf.text(`Total de elementos encontrados: ${formatNumber(totalElements)}`, 20, 50);

                // KPIs principales
                pdf.setFontSize(11);
                pdf.text(`Área del KML: ${formatNumber(kmlMetrics.area)} km²`, 20, 65);
                pdf.text(`Densidad de localidades: ${formatNumber(kmlMetrics.localityDensity)} loc/km²`, 20, 75);
                pdf.text(`Población total intersectada: ${formatNumber(kmlMetrics.totalPopulation)} hab.`, 20, 85);
                pdf.text(`Densidad poblacional: ${formatNumber(kmlMetrics.populationDensity)} hab/km²`, 20, 95);

                // Semáforo de intersecciones clave
                pdf.text('Intersecciones clave:', 20, 110);
                pdf.setFontSize(10);
                const semaforoY = 120;
                pdf.text('ANP:', 25, semaforoY);
                pdf.text(kmlMetrics.intersectsANP ? 'Sí' : 'No', 45, semaforoY);
                pdf.text('Ramsar:', 65, semaforoY);
                pdf.text(kmlMetrics.intersectsRamsar ? 'Sí' : 'No', 90, semaforoY);
                pdf.text('Zonas Históricas:', 110, semaforoY);
                pdf.text(kmlMetrics.intersectsZHistoricas ? 'Sí' : 'No', 150, semaforoY);
                pdf.text('Zonas Arqueológicas:', 25, semaforoY + 6);
                pdf.text(kmlMetrics.intersectsZA ? 'Sí' : 'No', 70, semaforoY + 6);
                pdf.setFontSize(12);

                // Incluir gráfico de distribución de capas si está disponible
                if (chartImages.layerChart) {
                    // Dimensiones para mantener proporción (capturado a scale 2, reducimos a tamaño PDF)
                    const chartWidth = 160;
                    const chartHeight = 75;
                    const chartX = (210 - chartWidth) / 2; // Centrado
                    pdf.addImage(chartImages.layerChart, 'PNG', chartX, 60, chartWidth, chartHeight);
                    pdf.text('Distribución de Elementos por Capa:', 20, 150);
                } else {
                    // Resumen por capas como texto
                    pdf.text('Distribución por capas:', 20, 70);
                    let yPos = 85;
                    Object.entries(layersData).forEach(([layerName, data]) => {
                        if (data.features && data.features.length > 0) {
                            const displayName = getLayerDisplayName(layerName);
                            const count = layerName === 'lenguas' ?
                                new Set(data.features.map(f => f.properties.Lengua || f.properties.LENGUA)).size :
                                data.features.length;
                            pdf.text(`${displayName}: ${formatNumber(count)} elementos`, 25, yPos);
                            yPos += 8;
                        }
                    });
                }

                updateProgress(25, 'Capturando gráficos...');

                // Capturar gráficos inmediatamente después de generarlos
                const chartContainers = ['layerChart', 'populationChart'];

                for (const containerId of chartContainers) {
                    const container = document.getElementById(containerId);
                    if (container && container.offsetHeight > 0 && container.querySelector('svg')) {
                        try {
                            console.log(`Capturando gráfico ${containerId}...`);
                            const canvas = await html2canvas(container, {
                                useCORS: true,
                                allowTaint: false,
                                scale: 2, // Mayor resolución para mejor calidad
                                backgroundColor: '#ffffff',
                                logging: false,
                                width: container.offsetWidth,
                                height: container.offsetHeight
                            });
                            chartImages[containerId] = canvas.toDataURL('image/png');
                            console.log(`Gráfico ${containerId} capturado exitosamente`);
                        } catch (error) {
                            console.warn(`Error capturando gráfico ${containerId}:`, error);
                        }
                    } else {
                        console.warn(`Contenedor ${containerId} no listo para captura:`, {
                            exists: !!container,
                            height: container?.offsetHeight,
                            hasSvg: !!container?.querySelector('svg')
                        });
                    }
                }

                updateProgress(30, 'Generando análisis de localidades...');

                // Página 3: Análisis de Localidades
                if (layersData.localidades && layersData.localidades.features && layersData.localidades.features.length > 0) {
                    pdf.addPage();
                    pdf.setFillColor(255, 255, 255);
                    pdf.rect(0, 0, 210, 297, 'F');

                    pdf.setTextColor(...primaryColor);
                    pdf.setFontSize(18);
                    pdf.text('Análisis de Localidades', 20, 30);

                    // Top 10 localidades por población
                    const localidadesData = layersData.localidades.features
                        .filter(f => f.properties.POBTOT)
                        .sort((a, b) => (b.properties.POBTOT || 0) - (a.properties.POBTOT || 0))
                        .slice(0, 10);

                    pdf.setTextColor(0, 0, 0);
                    pdf.setFontSize(12);

                    // Incluir gráfico de población si está disponible
                    if (chartImages.populationChart) {
                        // Dimensiones para mantener proporción (ancho:alto ≈ 2.125:1)
                        const chartWidth = 160;
                        const chartHeight = 75;
                        const chartX = (210 - chartWidth) / 2; // Centrado
                        pdf.addImage(chartImages.populationChart, 'PNG', chartX, 50, chartWidth, chartHeight);
                        pdf.text('Top 10 Localidades por Población Total:', 20, 140);

                        let yPos = 155;
                        localidadesData.slice(0, 5).forEach((loc, index) => {
                            const nombre = loc.properties.NOMGEO || loc.properties.NOM_LOC || 'Sin nombre';
                            const poblacion = formatNumber(loc.properties.POBTOT || 0);
                            pdf.text(`${index + 1}. ${nombre}: ${poblacion} hab.`, 25, yPos);
                            yPos += 8;
                        });
                    } else {
                        pdf.text('Top 10 Localidades por Población Total:', 20, 50);

                        let yPos = 65;
                        localidadesData.forEach((loc, index) => {
                            const nombre = loc.properties.NOMGEO || loc.properties.NOM_LOC || 'Sin nombre';
                            const poblacion = formatNumber(loc.properties.POBTOT || 0);
                            pdf.text(`${index + 1}. ${nombre}: ${poblacion} habitantes`, 25, yPos);
                            yPos += 8;
                        });
                    }
                }

                updateProgress(50, 'Generando páginas por capa...');

                // Usar las variables ya definidas arriba para el índice

                for (const layerName of allLayers) {
                    if (layersData[layerName] && layersData[layerName].features && layersData[layerName].features.length > 0) {
                        pdf.addPage();
                        pdf.setFillColor(255, 255, 255);
                        pdf.rect(0, 0, 210, 297, 'F');

                        pdf.setTextColor(...primaryColor);
                        pdf.setFontSize(16);
                        pdf.text(layerTitles[layerName], 20, 30);

                        pdf.setTextColor(0, 0, 0);
                        pdf.setFontSize(12);

                        const features = layersData[layerName].features;
                        const count = layerName === 'lenguas' ?
                            new Set(features.map(f => f.properties.Lengua || f.properties.LENGUA)).size :
                            features.length;

                        pdf.text(`Total de elementos: ${formatNumber(count)}`, 20, 50);

                        // Mostrar Top 10 elementos y nota para ver Excel completo
                        let yPos = 70;
                        const maxItems = 10;
                        const displayFeatures = features.slice(0, maxItems);

                        if (displayFeatures.length > 0) {
                            pdf.text(`Top ${maxItems} elementos:`, 20, yPos - 5);
                            yPos += 5;

                            displayFeatures.forEach((feature, index) => {
                                const props = feature.properties;
                                let displayText = '';

                                // Obtener texto de display según la capa
                                switch (layerName) {
                                    case 'localidades':
                                        displayText = fixMojibake(props.NOMGEO || props.NOM_LOC || 'Sin nombre');
                                        break;
                                    case 'atlas':
                                        displayText = fixMojibake(props.Localidad || 'Sin localidad');
                                        break;
                                    case 'municipios':
                                        displayText = fixMojibake(props.NOMGEO || props.NOM_MUN || 'Sin municipio');
                                        break;
                                    case 'ran':
                                        displayText = fixMojibake(props.MUNICIPIO || 'Sin municipio');
                                        break;
                                    case 'lenguas':
                                        displayText = fixMojibake(props.Lengua || props.LENGUA || 'Sin lengua');
                                        break;
                                    case 'loc_indigenas_datos':
                                        displayText = fixMojibake(props.LOCALIDAD || 'Sin localidad');
                                        break;
                                    default:
                                        const propertyMap = {
                                            regiones: 'Name',
                                            za_publico: 'Zona Arqueológica',
                                            za_publico_a: 'Zona Arqueológica',
                                            anp_estatal: 'NOMBRE',
                                            ramsar: 'RAMSAR',
                                            sitio_arqueologico: 'nombre',
                                            z_historicos: 'Nombre',
                                            rutaWixarika: 'Name'
                                        };
                                        displayText = fixMojibake(props[propertyMap[layerName]] || 'Sin nombre');
                                }

                                pdf.text(`${index + 1}. ${displayText}`, 25, yPos);
                                yPos += 8;
                            });

                            if (features.length > maxItems) {
                                yPos += 5;
                                pdf.setFontSize(9);
                                pdf.text(`Nota: ${formatNumber(features.length - maxItems)} elementos adicionales.`, 25, yPos);
                                pdf.text('Ver listado completo en el reporte Excel descargable.', 25, yPos + 6);
                                pdf.setFontSize(12);
                            }
                        }

                    } else {
                        // Página con "Sin dato" para capas sin información
                        pdf.addPage();
                        pdf.setFillColor(247, 244, 242);
                        pdf.rect(0, 0, 210, 297, 'F');

                        pdf.setTextColor(...primaryColor);
                        pdf.setFontSize(16);
                        pdf.text(layerTitles[layerName], 20, 30);

                        pdf.setTextColor(100, 100, 100);
                        pdf.setFontSize(14);
                        pdf.text('Sin dato disponible', 105, 120, { align: 'center' });
                    }
                }

                updateProgress(70, 'Generando análisis detallado...');

                // Agregar páginas de análisis detallado para capas clave (si se requieren adicionales)
                await addDetailedLayerAnalysis(pdf, layersData, primaryColor, secondaryColor, chartImages);

                updateProgress(60, 'Capturando vista del mapa...');

                // Página del Mapa (número variable después de análisis)
                pdf.addPage();
                pdf.setFillColor(255, 255, 255);
                pdf.rect(0, 0, 210, 297, 'F');

                pdf.setTextColor(...primaryColor);
                pdf.setFontSize(18);
                pdf.text('Vista del Mapa', 20, 30);

                // Preparar mapa para captura: SIEMPRE centrar en área KML original
                if (kmlGeoJson && kmlGeoJson.features) {
                    const kmlBounds = L.geoJSON(kmlGeoJson).getBounds();
                    if (kmlBounds && kmlBounds.isValid()) {
                        map.fitBounds(kmlBounds, { padding: [24, 24], maxZoom: 15, animate: false });
                        // Esperar a que el mapa se renderice completamente
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } else if (lastAreaBounds && lastAreaBounds.isValid()) {
                    // Fallback a lastAreaBounds si no hay kmlGeoJson
                    map.fitBounds(lastAreaBounds, { padding: [24, 24], maxZoom: 15, animate: false });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                // Capturar screenshot del mapa con timeout
                const mapElement = document.getElementById('map');
                if (mapElement) {
                    try {
                        const canvas = await Promise.race([
                            html2canvas(mapElement, {
                                useCORS: true,
                                allowTaint: false,
                                scale: 0.8,
                                width: 800,
                                height: 600,
                                timeout: 15000
                            }),
                            new Promise((_, reject) =>
                                setTimeout(() => reject(new Error('Timeout')), 15000)
                            )
                        ]);

                        const imgData = canvas.toDataURL('image/png');
                        pdf.addImage(imgData, 'PNG', 10, 40, 190, 142);

                        // Agregar leyenda de capas activas
                        pdf.setTextColor(...primaryColor);
                        pdf.setFontSize(12);
                        pdf.text('Capas activas en el mapa:', 20, 190);

                        pdf.setTextColor(0, 0, 0);
                        pdf.setFontSize(10);
                        let legendY = 200;
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

                        Object.entries(layersData).forEach(([layerName, data]) => {
                            if (data.features && data.features.length > 0) {
                                const displayName = getLayerDisplayName(layerName);
                                const count = layerName === 'lenguas' ?
                                    new Set(data.features.map(f => f.properties.Lengua || f.properties.LENGUA)).size :
                                    data.features.length;
                                // Dibujar punto de color
                                pdf.setFillColor(layerColors[layerName] || '#666666');
                                pdf.circle(23, legendY - 2, 1.5, 'F');
                                pdf.setFillColor(0, 0, 0);
                                pdf.text(`${displayName}: ${formatNumber(count)} elementos`, 30, legendY);
                                legendY += 6;
                            }
                        });
                    } catch (error) {
                        console.warn('Error capturando mapa:', error);
                        pdf.setTextColor(100, 100, 100);
                        pdf.setFontSize(12);
                        pdf.text('Vista del mapa no disponible', 105, 120, { align: 'center' });
                    }
                }

                updateProgress(80, 'Finalizando reporte...');

                // Pie de página en todas las páginas
                const pageCount = pdf.getNumberOfPages();
                for (let i = 1; i <= pageCount; i++) {
                    pdf.setPage(i);
                    pdf.setTextColor(100, 100, 100);
                    pdf.setFontSize(8);
                    pdf.text('Geovisualizador de Áreas de Interés - Gobierno de México', 105, 285, { align: 'center' });
                    pdf.text(`Página ${i} de ${pageCount}`, 190, 285, { align: 'right' });
                }

                updateProgress(100, 'Descargando archivo...');

                // Descargar archivo
                const fileName = `reporte_evaluacion_${new Date().toISOString().split('T')[0]}.pdf`;
                pdf.save(fileName);

                hidePreloader();
                showAlert(`Reporte PDF generado exitosamente: ${fileName}`, 'success', 4000);

            } catch (error) {
                console.error('Error generando reporte PDF:', error);
                hidePreloader();
                showAlert('Error al generar el reporte PDF. Intenta nuevamente.', 'danger', 4000);
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

        // Descargar reporte PDF
        const downloadPdfBtn = document.getElementById('downloadPdfBtn');
        if (downloadPdfBtn) {
            downloadPdfBtn.addEventListener('click', generatePdfReport);
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