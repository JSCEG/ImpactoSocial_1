# Análisis: Cálculo de la Capa de Localidades Indígenas

Tras analizar el código fuente y la documentación técnica del geovisualizador, hemos identificado cómo se procesan los datos para la capa **"Loc Indígenas Datos"** (Localidades Indígenas Datos).

## Resumen de Hallazgos

1.  **Terminología ("cap"):** En el contexto del proyecto, el término "cap" utilizado por el usuario es una abreviatura de **"Capa"** (Layer). No se encontró ninguna propiedad específica llamada "cap" en los datos ni cálculos matemáticos con ese nombre.
2.  **Identificación de la Capa:** La capa mencionada corresponde internamente a `loc_indigenas_datos`.
3.  **Fuente de Datos:** Los datos se obtienen de un archivo GeoJSON estático:
    `https://cdn.sassoapps.com/Gabvy/loc_indigenas_datos.geojson`
4.  **Lógica de Cálculo:** El sistema no "calcula" la capa en el sentido de generar datos nuevos, sino que realiza un **análisis de intersección espacial**.

## Proceso de Cálculo (Análisis Geoespacial)

El proceso de filtrado de esta capa se realiza mediante los siguientes pasos técnicos:

### 1. Intersección con el Área de Interés (KML)
El código utiliza la librería **Turf.js** para determinar qué localidades indígenas se encuentran dentro del polígono cargado por el usuario (o su área de buffer).

En `index3.js`, la función `processLayer` (Línea 6018) realiza la intersección:

```javascript
// index3.js:6035
if (feature.geometry && T.booleanIntersects(feature, analysisArea)) {
    intersectedFeatures.push(feature);
}
```

### 2. Atributos Mostrados
Para cada localidad encontrada, se extraen y muestran los siguientes atributos (identificados en la lógica del reporte Excel en `index3.js:6713`):

*   **Población Total:** `POBTOTAL` (Suma de habitantes de la localidad).
*   **Hogares Indígenas:** `PIHOGARES` (Población en hogares indígenas).
*   **Porcentaje de Hogares Indígenas:** `pPIHOGARES` (Calculado previamente en la fuente de datos).
*   **Tipo de Localidad:** `TIPOLOC_PI`.
*   **Población Afromexicana:** `POB_AFRO` y su porcentaje `pPOB_AFRO`.

### 3. Métricas de Resumen
En los reportes globales, se calcula el número de **Capas con datos** (layersWithData), que cuenta cuántas capas únicas tuvieron al menos un elemento intersectado:

```javascript
// index3.js:4580
const layersWithData = k.results ? Object.keys(k.results).filter(layerName =>
    k.results[layerName]?.features?.length > 0).length : 0;
```

## Conclusión

El "cálculo de la cap" (capa) de Localidades Indígenas consiste en un **filtrado geoespacial por intersección**. Si te refieres a algún indicador específico dentro de la tabla (como el porcentaje de hogares), estos valores ya vienen pre-calculados en el archivo GeoJSON de origen y el sistema simplemente los extrae para el reporte.
