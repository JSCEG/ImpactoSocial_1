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
let localitiesData = null; // Datos de localidades cargados desde el servidor
let kmlLayer = null; // Capa del polígono KML original cargado por el usuario
let bufferLayer = null; // Capa del buffer generado para área núcleo
let clippedLocalitiesLayer = null; // Capa de localidades resultantes del recorte
let kmlGeoJson = null; // Datos GeoJSON convertidos del KML original
let labelLayer = null; // Capa de etiquetas CVEGEO sobre el mapa
let lastAreaBounds = null; // Bounds del área para restaurar la vista del área

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
        // Garantizar que el preloader no bloquee la vista inicial
        hidePreloader();

        // ====================================================================
        // CONFIGURACIÓN DEL MAPA BASE
        // ====================================================================

        // Inicializar mapa centrado en México con zoom nacional
        map = L.map("map").setView([24.1, -102], 6);

        /**
         * Asegurar que el mapa calcule su tamaño correctamente
         * Esto es necesario porque los estilos se cargan de forma asíncrona
         */
        (function ensureMapSized(attempt = 0) {
            if (!map) return;

            const el = document.getElementById('map');
            const ready = el && el.clientHeight > 40;
            map.invalidateSize();

            // Reintentar hasta 10 veces si el contenedor no tiene altura
            if (!ready && attempt < 10) {
                setTimeout(() => ensureMapSized(attempt + 1), 150);
            }
        })();

        // Recalcular tamaño cuando la ventana termine de cargar
        window.addEventListener('load', () => {
            setTimeout(() => map && map.invalidateSize(), 100);
        });

        // Agregar capa base de OpenStreetMap
        const base = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // ====================================================================
        // CONFIGURACIÓN DE DATOS Y ELEMENTOS DEL DOM
        // ====================================================================

        // URL del servicio de localidades (datos geoespaciales de INEGI)
        const localitiesUrl = 'https://cdn.sassoapps.com/Gabvy/localidades_4326.geojson';

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
                const response = await fetch(localitiesUrl);
                if (!response.ok) {
                    throw new Error(`Error HTTP! status: ${response.status}`);
                }

                localitiesData = await response.json();
                console.log(`Localidades cargadas: ${localitiesData.features.length}`);
                showAlert(`Localidades cargadas: ${localitiesData.features.length}`, 'success');

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
            if (labelLayer) map.removeLayer(labelLayer);

            // Resetear variables de estado
            kmlLayer = null;
            bufferLayer = null;
            clippedLocalitiesLayer = null;
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
            if (badge) badge.textContent = '0';
            const totalFound = document.getElementById('totalFound');
            if (totalFound) totalFound.textContent = '0';
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
         * Navega suavemente a una feature específica en el mapa
         * Ajusta automáticamente el zoom y centrado óptimos según el tipo de geometría
         * @param {object} ref - Referencia que contiene bounds o latlng de la feature
         */
        function goToFeatureRef(ref) {
            if (!ref) return;

            if (ref.bounds && ref.bounds.isValid()) {
                // Para polígonos: centrar en bounds con zoom calculado automáticamente
                const center = ref.bounds.getCenter();
                const targetZoom = Math.min(map.getBoundsZoom(ref.bounds, true), 15);
                map.setView(center, targetZoom, {
                    animate: true,
                    duration: 0.6
                });
            } else if (ref.latlng) {
                // Para puntos: usar zoom mínimo razonable
                const z = Math.max(map.getZoom(), 13);
                map.setView(ref.latlng, z, {
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
                    li.innerHTML = `<span class="color-dot" style="background:${color}"></span>${f.properties.CVEGEO}`;
                    li.dataset.cvegeo = f.properties.CVEGEO;
                    li.setAttribute('role', 'button');
                    li.setAttribute('tabindex', '0');
                    li.setAttribute('aria-label', `Ir a localidad ${f.properties.CVEGEO}`);
                    ul.appendChild(li);
                }
            });

            cvegeoListDiv.innerHTML = '';
            cvegeoListDiv.appendChild(ul);

            // Actualizar contadores en la interfaz
            const badge = document.getElementById('foundCountBadge');
            if (badge) badge.textContent = String(features.length);
            const totalFound = document.getElementById('totalFound');
            if (totalFound) totalFound.textContent = String(features.length);
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
            // Validar archivo antes de procesar
            if (!validateKmlFile(file)) {
                return;
            }

            const reader = new FileReader();

            reader.onload = function (e) {
                try {
                    const kmlText = e.target.result;

                    // Validar que el contenido no esté vacío
                    if (!kmlText || kmlText.trim().length === 0) {
                        showAlert('El archivo KML está vacío o no se pudo leer correctamente.', 'danger');
                        return;
                    }

                    // Parsear XML del KML
                    const kmlDom = new DOMParser().parseFromString(kmlText, 'text/xml');

                    // Verificar errores de parseo XML
                    const parseError = kmlDom.querySelector('parsererror');
                    if (parseError) {
                        showAlert('El archivo KML contiene errores de formato XML. Verifica que sea un archivo válido.', 'danger');
                        return;
                    }

                    // Convertir KML a GeoJSON usando la librería togeojson
                    kmlGeoJson = toGeoJSON.kml(kmlDom);

                    // Verificar que la conversión fue exitosa
                    if (!kmlGeoJson || !kmlGeoJson.features || kmlGeoJson.features.length === 0) {
                        showAlert('El archivo KML no contiene geometrías válidas o no se pudo convertir.', 'warning');
                        performClipBtn.disabled = true;
                        return;
                    }

                    // Buscar el primer polígono válido en el KML
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

                    // Remover capa anterior si existe
                    if (kmlLayer) map.removeLayer(kmlLayer);

                    // Agregar nueva capa con estilo institucional
                    kmlLayer = L.geoJSON(kmlPolygon, {
                        style: {
                            color: '#ff7800',
                            weight: 3,
                            fillColor: '#ffa500',
                            fillOpacity: 0.2
                        }
                    }).addTo(map);

                    // Asegurar que el mapa se actualice correctamente después de cambios de layout
                    setTimeout(() => {
                        map.invalidateSize();
                        const b = kmlLayer.getBounds();
                        if (b && b.isValid()) {
                            map.fitBounds(b, { padding: [24, 24], maxZoom: 15, animate: true, duration: 0.5 });
                        }
                    }, 50);

                    // Habilitar siguiente paso del flujo
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

            // Leer archivo como texto
            reader.readAsText(file);
        }

        // ====================================================================
        // PROCESAMIENTO GEOESPACIAL PRINCIPAL
        // ====================================================================

        /**
         * Realiza el recorte de localidades según el área seleccionada
         * Esta es la función más compleja del sistema, que:
         * 1. Carga las localidades si no están en memoria
         * 2. Genera buffers según el tipo de área
         * 3. Realiza intersecciones geoespaciales
         * 4. Visualiza los resultados con colores diferenciados
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
                // PROCESAMIENTO DE INTERSECCIONES
                // ============================================================

                const clipped = [];
                const total = localitiesData.features.length;
                let processed = 0;

                // Configurar actualizaciones y procesamiento en lotes para permitir repintado de UI
                const base = 20; // % reservado para setup
                const loopSpan = 75; // % dedicado al bucle de intersección (20 -> 95)
                const batchSize = Math.max(500, Math.floor(total / 200)); // ~hasta 200 lotes
                const features = localitiesData.features;
                const yieldUI = () => new Promise(res => (window.requestAnimationFrame ? requestAnimationFrame(() => res()) : setTimeout(res, 0)));

                for (let start = 0; start < total; start += batchSize) {
                    const end = Math.min(start + batchSize, total);
                    for (let i = start; i < end; i++) {
                        const loc = features[i];
                        if (T.booleanIntersects(loc.geometry, clipArea.geometry)) {
                            clipped.push(loc);
                        }
                    }
                    processed = end;
                    const frac = processed / Math.max(1, total);
                    const pct = base + loopSpan * frac; // 20% -> 95%
                    updateProgress(pct, `Procesando localidades… ${processed}/${total}`);
                    // Ceder control al navegador para que repinte barra y spinner
                    await yieldUI();
                }

                updateProgress(95, `Encontradas ${clipped.length} localidades. Preparando visualización…`);

                // ============================================================
                // VISUALIZACIÓN DE RESULTADOS
                // ============================================================

                if (clipped.length > 0) {
                    // Generar paleta de colores distinta por CVEGEO
                    const colorsById = new Map();
                    const palette = [
                        '#d11149', '#1a8fe3', '#119822', '#ff7f0e', '#9467bd',
                        '#e377c2', '#17becf', '#bcbd22', '#8c564b', '#2ca02c',
                        '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
                        '#a65628', '#f781bf', '#999999', '#66c2a5', '#fc8d62'
                    ];

                    let colorIndex = 0;
                    for (const f of clipped) {
                        const id = f.properties?.CVEGEO || String(colorIndex);
                        if (!colorsById.has(id)) {
                            colorsById.set(id, palette[colorIndex % palette.length]);
                            colorIndex++;
                        }
                    }

                    // Crear capa de localidades con estilos diferenciados
                    featureLayersById = new Map();
                    const clippedCollection = T.featureCollection(clipped);

                    clippedLocalitiesLayer = L.geoJSON(clippedCollection, {
                        // Estilo para polígonos/líneas diferenciado por CVEGEO
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

                        // Convertir puntos a círculos con color asignado
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

                        // Configurar popups informativos y navegación
                        onEachFeature: (feature, layer) => {
                            if (feature.properties) {
                                const props = feature.properties;
                                const nombre = props.NOM_LOC || props.NOMGEO || props.NOMBRE || '—';
                                const cvegeo = props.CVEGEO || '—';
                                const ambito = props.AMBITO || '—';

                                // Popup con información básica de la localidad
                                layer.bindPopup(`
                                    <strong>Información de la Localidad</strong><br>
                                    <strong>Nombre:</strong> ${nombre}<br>
                                    <strong>CVEGEO:</strong> ${cvegeo}<br>
                                    <strong>Ámbito:</strong> ${ambito}
                                `);

                                // Guardar referencia para navegación
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

                            // Evento click: centrar y destacar en lista
                            layer.on('click', () => {
                                const id = feature.properties?.CVEGEO;
                                if (id) setActiveListItem(id);

                                const ref = featureLayersById.get(id) || (layer.getBounds
                                    ? { bounds: layer.getBounds(), layer }
                                    : layer.getLatLng ? { latlng: layer.getLatLng(), layer } : null);

                                goToFeatureRef(ref);
                                if (layer.openPopup) layer.openPopup();
                            });
                        }
                    }).addTo(map);

                    // ========================================================
                    // CREACIÓN DE ETIQUETAS CVEGEO
                    // ========================================================

                    const labels = [];
                    clipped.forEach(f => {
                        const id = f.properties?.CVEGEO;
                        const color = (id && colorsById.get(id)) || '#008000';

                        // Manejar diferentes tipos de geometría para etiquetas
                        if (f.geometry.type === 'Point') {
                            const [lng, lat] = f.geometry.coordinates;
                            const icon = L.divIcon({
                                className: 'cvegeo-label',
                                html: `<span style="background:${color};color:#fff;padding:2px 4px;border-radius:3px;font-size:11px;">${id || ''}</span>`
                            });
                            labels.push(L.marker([lat, lng], { icon }));

                        } else if (f.geometry.type === 'MultiPoint') {
                            f.geometry.coordinates.forEach(([lng, lat]) => {
                                const icon = L.divIcon({
                                    className: 'cvegeo-label',
                                    html: `<span style="background:${color};color:#fff;padding:2px 4px;border-radius:3px;font-size:11px;">${id || ''}</span>`
                                });
                                labels.push(L.marker([lat, lng], { icon }));
                            });

                        } else if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
                            try {
                                // Calcular centroide para polígonos
                                const centroid = T.centroid(f);
                                const [lng, lat] = centroid.geometry.coordinates;
                                const icon = L.divIcon({
                                    className: 'cvegeo-label',
                                    html: `<span style="background:${color};color:#fff;padding:2px 4px;border-radius:3px;font-size:11px;">${id || ''}</span>`
                                });
                                labels.push(L.marker([lat, lng], { icon }));
                            } catch (e) {
                                // Si falla el cálculo del centroide, omitir etiqueta
                                console.warn('No se pudo calcular centroide para feature:', id);
                            }
                        }
                    });

                    // Agregar capa de etiquetas si hay etiquetas válidas
                    if (labels.length) labelLayer = L.layerGroup(labels).addTo(map);

                    // ========================================================
                    // FINALIZACIÓN Y AJUSTES DE VISTA
                    // ========================================================

                    // Calcular bounds combinados del área (buffer o KML) y resultados
                    const areaBounds = (bufferLayer && bufferLayer.getBounds && bufferLayer.getBounds().isValid())
                        ? bufferLayer.getBounds()
                        : (kmlLayer && kmlLayer.getBounds && kmlLayer.getBounds().isValid())
                            ? kmlLayer.getBounds()
                            : null;
                    const resultBounds = clippedLocalitiesLayer.getBounds();
                    let combinedBounds = null;
                    if (areaBounds && areaBounds.isValid()) {
                        combinedBounds = L.latLngBounds(areaBounds.getSouthWest(), areaBounds.getNorthEast());
                        if (resultBounds && resultBounds.isValid()) combinedBounds.extend(resultBounds);
                    } else if (resultBounds && resultBounds.isValid()) {
                        combinedBounds = resultBounds;
                    }

                    // Guardar bounds para función de restaurar vista
                    lastAreaBounds = combinedBounds;
                    if (resetViewBtn) {
                        resetViewBtn.disabled = !lastAreaBounds || !lastAreaBounds.isValid();
                    }

                    // Ajustar vista al encuadre del recorte completo
                    setTimeout(() => {
                        map.invalidateSize();
                        if (lastAreaBounds && lastAreaBounds.isValid()) {
                            map.fitBounds(lastAreaBounds, { padding: [24, 24], maxZoom: 15, animate: true, duration: 0.6 });
                        }
                    }, 50);

                    // Actualizar interfaz con resultados
                    displayCvegeoList(clipped, colorsById);
                    showModal({
                        title: 'Recorte completado',
                        message: `Se encontraron <strong>${clipped.length}</strong> localidades dentro del área seleccionada.`,
                        okText: 'Aceptar'
                    });
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
                    if (badge) badge.textContent = '0';
                    const totalFound = document.getElementById('totalFound');
                    if (totalFound) totalFound.textContent = '0';
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
