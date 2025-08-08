# Geovisualizador de Áreas de Interés - SENER

## Descripción del Proyecto

Sistema web para la visualización y análisis geoespacial de localidades en relación con áreas de interés definidas por archivos KML. Desarrollado para la **Secretaría de Energía (SENER)** del Gobierno de México.

### Funcionalidades Principales

- **Carga de archivos KML**: Permite cargar polígonos que definen áreas de interés
- **Análisis geoespacial**: Identifica localidades que intersectan con las áreas definidas
- **Tres tipos de análisis**:
  - Área núcleo (con buffer de 500 metros)
  - Área de influencia directa
  - Área de influencia indirecta
- **Visualización interactiva**: Mapa con código de colores por CVEGEO
- **Interfaz responsive**: Optimizada para dispositivos móviles y escritorio
- **Reportes visuales**: Lista de localidades encontradas con navegación interactiva

---

## Arquitectura Técnica

### Tecnologías Utilizadas

| Componente | Tecnología | Versión | Propósito |
|------------|------------|---------|-----------|
| **Frontend** | HTML5, CSS3, JavaScript ES6+ | - | Interfaz de usuario |
| **Framework UI** | Bootstrap | 5.3.3 | Diseño responsive y componentes |
| **Mapas** | Leaflet | 1.9.4 | Visualización cartográfica |
| **Operaciones Geoespaciales** | Turf.js | 6.x | Análisis espacial y geometrías |
| **Conversión de Datos** | togeojson.js | Personalizada | Conversión KML a GeoJSON |
| **Mapas Base** | OpenStreetMap | - | Cartografía base |

### Estructura de Archivos

```
ImpactoSocial_1/
├── index.html          # Página principal con estructura HTML
├── index.js            # Lógica principal de la aplicación
├── style.css           # Estilos institucionales personalizados
├── togeojson.js        # Librería para conversión KML
├── img/                # Recursos gráficos institucionales
│   ├── logo_gob.png    # Logo del Gobierno de México
│   ├── logo_sener.png  # Logo de SENER
│   └── mujer.png       # Imagen para preloader
└── README.md           # Esta documentación
```

---

## Instalación y Despliegue

### Requisitos del Sistema

- **Servidor Web**: Apache, Nginx, IIS o similar
- **Navegadores Soportados**: Chrome 80+, Firefox 75+, Safari 13+, Edge 80+
- **Conexión a Internet**: Requerida para CDNs y servicios de datos

### Pasos de Instalación

1. **Clonar o descargar** los archivos del proyecto
2. **Subir archivos** al directorio web del servidor
3. **Configurar servidor web** para servir archivos estáticos
4. **Verificar conectividad** a los siguientes servicios externos:
   - CDNs de Bootstrap, Leaflet y Turf.js
   - Servicio de localidades: `https://cdn.sassoapps.com/Gabvy/localidades_4326.geojson`

### Configuración de Servidor Web

#### Apache (.htaccess)
```apache
# Habilitar compresión
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/plain
    AddOutputFilterByType DEFLATE text/html
    AddOutputFilterByType DEFLATE text/xml
    AddOutputFilterByType DEFLATE text/css
    AddOutputFilterByType DEFLATE application/xml
    AddOutputFilterByType DEFLATE application/xhtml+xml
    AddOutputFilterByType DEFLATE application/rss+xml
    AddOutputFilterByType DEFLATE application/javascript
    AddOutputFilterByType DEFLATE application/x-javascript
</IfModule>

# Cache estático
<IfModule mod_expires.c>
    ExpiresActive on
    ExpiresByType text/css "access plus 1 month"
    ExpiresByType application/javascript "access plus 1 month"
    ExpiresByType image/png "access plus 1 month"
</IfModule>
```

#### Nginx
```nginx
location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg)$ {
    expires 1M;
    add_header Cache-Control "public, immutable";
}

location / {
    try_files $uri $uri/ /index.html;
}
```

---

## Guía de Uso

### Flujo de Trabajo

1. **Cargar archivo KML**
   - Hacer clic en "1) Cargar KML"
   - Seleccionar archivo KML que contenga un polígono válido
   - Presionar "Subir KML"

2. **Configurar tipo de análisis**
   - Expandir "2) Recorte de Localidades"
   - Seleccionar tipo de área:
     - **Área núcleo**: Incluye buffer de 500 metros
     - **Área de influencia directa**: Área exacta del polígono
     - **Área de influencia indirecta**: Área exacta del polígono
   - Presionar "Realizar Recorte"

3. **Revisar resultados**
   - Expandir "3) Localidades encontradas"
   - Revisar lista de CVEGEO con código de colores
   - Hacer clic en cualquier elemento para navegar en el mapa

4. **Limpiar y reiniciar**
   - Usar "4) Limpiar Mapa" para reiniciar el proceso

### Interpretación de Resultados

- **Colores en el mapa**: Cada CVEGEO tiene un color único asignado
- **Lista de localidades**: Muestra todos los CVEGEO encontrados
- **Popups informativos**: Contienen nombre, CVEGEO y ámbito de la localidad
- **Etiquetas**: Muestran el CVEGEO directamente sobre el mapa

---

## Administración y Mantenimiento

### Monitoreo del Sistema

#### Indicadores de Salud
- **Tiempo de carga inicial**: < 5 segundos
- **Tiempo de procesamiento de recorte**: < 30 segundos para áreas normales
- **Disponibilidad del servicio de localidades**: 99.9%

#### Logs de Errores
Revisar la consola del navegador para errores comunes:
```javascript
// Error de conectividad
"Error al cargar localidades desde el servidor"

// Error de archivo KML
"El archivo KML no contiene un polígono válido"

// Error de dependencias
"Turf no disponible desde ningún CDN"
```

### Actualización del Sistema

#### Versionado Cache-Busting
El sistema utiliza `APP_VERSION` en `index.html` para invalidar caché:
```javascript
window.APP_VERSION = '20250807-1'; // Actualizar para forzar recarga
```

#### Actualización de Dependencias
Para actualizar librerías externas, modificar las URLs en `index.html`:
```html
<!-- Ejemplo: Actualizar Bootstrap -->
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
```

### Respaldo y Recuperación

#### Archivos Críticos a Respaldar
- `index.html`, `index.js`, `style.css`
- Directorio `img/` completo
- `togeojson.js` (versión personalizada)

#### Procedimiento de Recuperación
1. Restaurar archivos desde respaldo
2. Verificar permisos de lectura del servidor web
3. Probar conectividad a servicios externos
4. Validar funcionalidad con archivo KML de prueba

---

## Troubleshooting

### Problemas Comunes

#### 1. El mapa no se carga
**Síntomas**: Área del mapa en blanco
**Causas posibles**:
- Bloqueador de anuncios bloqueando OpenStreetMap
- Firewall corporativo bloqueando recursos externos
- Error en la inicialización de Leaflet

**Soluciones**:
```javascript
// Verificar en consola:
console.log(typeof L); // Debe ser "object"
console.log(map); // Debe ser una instancia de Map
```

#### 2. Error al cargar localidades
**Síntomas**: Mensaje "Error al cargar localidades desde el servidor"
**Causas posibles**:
- Servicio externo no disponible
- Problemas de conectividad
- CORS bloqueado por el navegador

**Soluciones**:
- Verificar conectividad: `curl https://cdn.sassoapps.com/Gabvy/localidades_4326.geojson`
- Configurar proxy interno si es necesario
- Implementar servicio local de localidades

#### 3. KML no se procesa correctamente
**Síntomas**: "El archivo KML no contiene un polígono válido"
**Causas posibles**:
- Archivo KML corrupto o mal formado
- KML contiene solo puntos/líneas, no polígonos
- Estructura XML inválida

**Soluciones**:
- Validar estructura XML del KML
- Verificar que contenga elementos `<Polygon>` o `<MultiPolygon>`
- Usar herramientas como Google Earth para validar el KML

#### 4. Rendimiento lento en el recorte
**Síntomas**: Proceso de recorte toma más de 1 minuto
**Causas posibles**:
- Archivo KML con geometría muy compleja
- Navegador con recursos limitados
- Área de recorte muy extensa

**Soluciones**:
- Simplificar geometría del KML antes de cargar
- Usar navegadores modernos con más memoria
- Dividir áreas extensas en secciones más pequeñas

### Contacto de Soporte Técnico

**Equipo de Desarrollo**: 
- Email: calidad@energia.gob.mx
- Horario: Lunes a Viernes, 9:00 - 17:00 hrs

**Escalamiento**:
- Nivel 1: Administrador del servidor web
- Nivel 2: Equipo de desarrollo de aplicaciones
- Nivel 3: Arquitectos de soluciones TI SENER

---

## Mejoras Futuras Recomendadas

### Corto Plazo (1-3 meses)
- [ ] Implementar caché local de localidades para mejor rendimiento
- [ ] Agregar validación más robusta de archivos KML
- [ ] Incluir más tipos de áreas de análisis personalizables
- [ ] Exportar resultados a formatos estándar (CSV, GeoJSON)

### Mediano Plazo (3-6 meses)
- [ ] Integración con bases de datos internas de SENER
- [ ] Sistema de autenticación para usuarios corporativos
- [ ] Dashboard de métricas y reportes históricos
- [ ] API REST para integración con otros sistemas

### Largo Plazo (6-12 meses)
- [ ] Migración a arquitectura de microservicios
- [ ] Implementación de análisis más complejos (proximidad, densidad)
- [ ] Soporte para múltiples proyecciones geográficas
- [ ] Módulo de colaboración y comentarios entre usuarios

---

## Licencia y Propiedad Intelectual

**Propietario**: Secretaría de Energía (SENER) - Gobierno de México
**Clasificación**: Software de uso interno gubernamental
**Restricciones**: Uso exclusivo para actividades oficiales de SENER

### Dependencias de Terceros
- **Bootstrap**: MIT License
- **Leaflet**: BSD-2-Clause License  
- **Turf.js**: MIT License
- **OpenStreetMap**: Open Database License (ODbL)

---

## Histórico de Versiones

| Versión | Fecha | Cambios Principales |
|---------|-------|-------------------|
| 1.0.0 | 2025-01-08 | Versión inicial con funcionalidades básicas |
| 1.1.0 | TBD | Mejoras de documentación y comentarios de código |

---

**Última actualización**: Enero 2025  
**Preparado por**: Equipo de Desarrollo TI SENER  
**Estado**: Listo para Producción