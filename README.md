# Geovisualizador de Áreas de Interés

Sistema web para análisis geoespacial que permite identificar elementos de múltiples capas dentro de áreas de interés definidas por archivos KML.

## 🚀 Características Principales

- **Análisis Multicapa**: Soporte para 6 capas geoespaciales diferentes
- **Interfaz Responsive**: Diseño mobile-first con Bootstrap 5
- **Carga de KML**: Procesamiento de archivos KML/KMZ para definir áreas de interés
- **Análisis de Buffer**: Generación automática de buffer de 500m para área núcleo
- **Navegación Inteligente**: Sistema de foco para navegar a elementos específicos
- **Feedback Visual**: Alertas, preloader con progreso y destacado de elementos

## 📁 Estructura del Proyecto

```
├── index.html          # Página de selección de versiones
├── index2.html         # Geovisualizador multicapa (versión principal)
├── index2.js           # Lógica principal de la aplicación
├── style2.css          # Estilos personalizados con paleta institucional
├── togeojson.js        # Librería para conversión KML a GeoJSON
└── img/                # Recursos gráficos (logos, iconos)
```

## 🛠️ Tecnologías Utilizadas

### Frontend
- **HTML5** con semántica accesible
- **CSS3** con variables personalizadas y diseño responsive
- **JavaScript ES6+** con async/await y módulos
- **Bootstrap 5.3.3** para componentes y grid system
- **Bootstrap Icons** para iconografía

### Librerías de Mapas
- **Leaflet 1.9.4** - Motor principal de mapas
- **Leaflet Omnivore** - Carga de archivos geoespaciales
- **Turf.js 6** - Operaciones geoespaciales avanzadas
- **togeojson.js** - Conversión de KML a GeoJSON

## 🎨 Diseño y UX

### Paleta de Colores Institucional
- **Primario**: `#7C1946` (Vino institucional)
- **Secundario**: `#197E74` (Verde complementario)
- **Acento**: `#C49A3E` (Dorado)
- **Fondo**: `#F7F4F2` (Beige claro)

### Características de Diseño
- Diseño mobile-first con breakpoints responsive
- Acordeón colapsible para organizar controles
- Sistema de alertas con auto-dismiss
- Preloader con barra de progreso
- Footer institucional estilo gob.mx

## 📊 Capas Geoespaciales Soportadas

1. **Localidades** - Puntos de localidades mexicanas
2. **Atlas Pueblos Indígenas** - Información de comunidades indígenas
3. **Municipios** - Polígonos municipales
4. **Regiones Indígenas** - Áreas de regiones indígenas
5. **RAN** - Datos del Registro Agrario Nacional
6. **Lenguas Indígenas** - Puntos de lenguas indígenas con agrupación

## 🔧 Funcionalidades Técnicas

### Sistema de Carga Inteligente
- Carga asíncrona de dependencias con fallback a múltiples CDNs
- Control de versiones para evitar problemas de caché
- Carga condicional de Turf.js bajo demanda

### Procesamiento Geoespacial
- Conversión automática de KML a GeoJSON
- Operaciones de intersección espacial con Turf.js
- Generación de buffers geométricos
- Recorte de capas por área de interés

### Sistema de Navegación
- Navegación automática a elementos seleccionados
- Activación automática de capas relacionadas
- Highlight visual con efectos de pulso
- Restauración de vista del área analizada

## 🚦 Flujo de Uso

1. **Cargar KML**: Usuario sube archivo KML con área de interés
2. **Seleccionar Tipo**: Elige entre área núcleo, directa o indirecta
3. **Realizar Análisis**: Sistema procesa intersecciones espaciales
4. **Ver Resultados**: Lista interactiva de elementos encontrados
5. **Navegar**: Click en elementos para enfocar en el mapa

## 🔒 Características de Producción

### Performance
- Carga lazy de librerías pesadas
- Debounce en operaciones costosas
- Manejo eficiente de memoria para datasets grandes

### Robustez
- Manejo de errores con fallbacks
- Timeouts para requests de red
- Validación de archivos KML
- Datos de ejemplo para desarrollo offline

### Accesibilidad
- Navegación por teclado
- Etiquetas ARIA apropiadas
- Contraste de colores accesible
- Soporte para lectores de pantalla

## 🌐 Compatibilidad

- **Navegadores**: Chrome 80+, Firefox 75+, Safari 13+, Edge 80+
- **Dispositivos**: Desktop, tablet y móvil
- **Formatos**: KML, KMZ
- **Proyecciones**: WGS84 (EPSG:4326)

## 📱 Responsive Design

- **Móvil** (< 768px): Layout vertical, controles colapsados
- **Tablet** (768px - 992px): Layout híbrido
- **Desktop** (> 992px): Sidebar + mapa principal

## 🔄 Sistema de Versionado

El proyecto utiliza un sistema de versionado automático para archivos estáticos:
- Variable `APP_VERSION` en index2.html
- Cache-busting automático para CSS/JS
- Invalidación de caché en actualizaciones

## 📈 Métricas y Monitoreo

- Tracking de errores de carga de capas
- Métricas de performance de operaciones geoespaciales
- Logs de uso para optimización

---

**Desarrollado para análisis geoespacial institucional con estándares de gobierno digital mexicano.**