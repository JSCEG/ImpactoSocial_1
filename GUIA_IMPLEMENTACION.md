# Guía de Implementación Rápida - Recorte de Capas Geoespaciales

## Resumen del Sistema

El **Geovisualizador de Áreas de Interés** implementa un algoritmo avanzado de recorte de capas geoespaciales que permite identificar localidades mexicanas que intersectan con áreas de interés definidas por archivos KML.

## Funcionalidad Central: ¿Cómo Funciona el Recorte de Capas?

### 1. Carga de Datos
```javascript
// Cargar archivo KML del usuario
const kmlGeoJson = toGeoJSON.kml(kmlDom);

// Cargar base de datos de localidades INEGI (~30,000 registros)
const localitiesData = await fetch('https://cdn.sassoapps.com/Gabvy/localidades_4326.geojson');
```

### 2. Preparación del Área de Análisis
```javascript
let clipArea = kmlPolygon;

// Para área núcleo: generar buffer de 500 metros
if (areaType === 'nucleo') {
    clipArea = turf.buffer(kmlPolygon, 500, { units: 'meters' });
}
```

### 3. Algoritmo de Intersección
```javascript
const clipped = [];
for (const locality of localitiesData.features) {
    // OPERACIÓN CRÍTICA: Intersección geoespacial
    if (turf.booleanIntersects(locality.geometry, clipArea.geometry)) {
        clipped.push(locality);  // Preservar feature completa
    }
}
```

### 4. Visualización de Resultados
```javascript
// Generar colores únicos por CVEGEO
const colorsById = new Map();
clipped.forEach((feature, index) => {
    const cvegeo = feature.properties.CVEGEO;
    colorsById.set(cvegeo, palette[index % palette.length]);
});
```

## Librerías Clave

| Librería | Función en el Recorte | Operaciones Específicas |
|----------|----------------------|-------------------------|
| **Turf.js** | Motor geoespacial | `buffer()`, `booleanIntersects()`, `centroid()` |
| **Leaflet.js** | Visualización | `L.geoJSON()`, `L.circleMarker()`, `L.divIcon()` |
| **togeojson.js** | Conversión de datos | `toGeoJSON.kml()` para KML→GeoJSON |

## Flujo de Propiedades

```javascript
// ENTRADA: Feature de localidad INEGI
const locality = {
    geometry: { type: "Point", coordinates: [-99.13, 19.43] },
    properties: { 
        CVEGEO: "090010001",
        NOM_LOC: "Ciudad de México",
        AMBITO: "Urbano"
    }
};

// PROCESAMIENTO: Evaluación geoespacial
const intersects = turf.booleanIntersects(
    locality.geometry,     // Geometría de la localidad
    clipArea.geometry      // Área de interés (KML + buffer opcional)
);

// SALIDA: Feature preservada en arreglo resultado
if (intersects) {
    clipped.push(locality);  // Se conservan TODAS las propiedades
}
```

## Generación del Arreglo Final

1. **Filtrado espacial**: Solo localidades que intersectan
2. **Preservación de datos**: Features completas (geometría + propiedades)
3. **Indexación**: Mapeo CVEGEO → Color para visualización
4. **Estructuras auxiliares**: Referencias para navegación interactiva

## Instalación

1. **Descargar archivos** del proyecto
2. **Configurar servidor web** (Apache, Nginx, IIS)
3. **Verificar conectividad** a CDNs externos
4. **Validar funcionalidad** con archivo KML de prueba

## Contacto Técnico

**Soporte:** calidad@energia.gob.mx  
**Documentación completa:** Ver `DOCUMENTACION_TECNICA.md` y `ENTREGA_FORMAL.md`