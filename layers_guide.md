# Guía de Capas y Consumo de Datos

Esta guía documenta las capas geoespaciales disponibles en el Geovisualizador, su origen, formato y la estrategia de consumo implementada.

## Estrategia de Carga Dinámica (Localidades)
Para optimizar el rendimiento, la capa de **Localidades** (la más pesada, ~400MB) ha sido particionada en 32 archivos (uno por entidad federativa).

**Lógica de Consumo:**
1.  El usuario carga un **KML/KMZ**.
2.  El sistema calcula el **Bounding Box** (Extensión geográfica) del KML.
3.  Se cruza este Bounding Box con un índice espacial de los 32 estados.
4.  El sistema determina qué estados toca el KML.
5.  Se descargan **exclusivamente** los archivos GeoJSON de esos estados.

**Ruta de Archivos:**
*   Local: `capas/loc_total[estado]_4326.geojson`
*   Nube: `https://[cdn-url]/capas/loc_total[estado]_4326.geojson` (Configurable)

---

## Inventario de Capas

| ID | Nombre | Tipo | Formato | Origen | Descripción |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **localidades** | Localidades (Polígonos) | Polígono | GeoJSON (Particionado) | `capas/` | Mancha urbana y límites de localidades. Carga dinámica por estado. |
| **puntos** | Localidades (Puntos) | Punto | GeoJSON | CDN | Centroides de localidades rurales o pequeñas. |
| **municipios** | Municipios | Polígono | GeoJSON | CDN | Límites municipales de todo el país. |
| **atlas** | Atlas Pueblos Indígenas | Punto | GeoJSON | CDN | Puntos de referencia del INPI. |
| **regiones** | Regiones Indígenas | Polígono | GeoJSON | CDN | Regiones identificadas con presencia indígena. |
| **lenguas** | Lenguas Indígenas | Punto | GeoJSON | CDN | Distribución de hablantes. |
| **loc_ind** | Datos Indígenas | Punto | GeoJSON | CDN | Datos censales de población indígena. |
| **ruta** | Ruta Wixarika | Polígono | GeoJSON | CDN | Polígonos de protección de la ruta sagrada. |
| **ran** | Núcleos Agrarios (RAN) | Polígono | GeoJSON | CDN | Ejidos y Comunidades Agrarias. |
| **anp_estatal** | ANP Estatal | Polígono | GeoJSON | CDN | Áreas Naturales Protegidas de competencia estatal. |
| **ramsar** | Sitios Ramsar | Polígono | GeoJSON | CDN | Humedales de importancia internacional. |
| **za_publico** | Zonas Arqueológicas | Polígono | GeoJSON | CDN | Polígonos oficiales del INAH (Abiertos al público). |
| **sitio_arqueologico**| Sitios Arqueológicos | Punto | GeoJSON | CDN | Puntos de hallazgos o sitios menores. |
| **z_historicos** | Zonas Históricas | Polígono | GeoJSON | CDN | Centros históricos protegidos. |

## Estructura de Archivos (Localidades)
Los archivos de localidades siguen la nomenclatura: `loc_total[nombre_estado]_4326.geojson`.

**Lista de Entidades:**
1.  `aguascalientes`
2.  `bajacalifornia`
3.  `bajacaliforniasur`
4.  `campeche`
5.  `coahuila`
6.  `colima`
7.  `chiapas`
8.  `chihuahua`
9.  `cdmx`
10. `durango`
11. `guanajuato`
12. `guerrero`
13. `hidalgo`
14. `jalisco`
15. `mexico` (Estado de México)
16. `michoacan`
17. `morelos`
18. `nayarit`
19. `nuevoleon`
20. `oaxaca`
21. `puebla`
22. `queretaro`
23. `quintanaroo`
24. `sanluispotosi`
25. `sinaloa`
26. `sonora`
27. `tabasco`
28. `tamaulipas`
29. `tlaxcala`
30. `veracruz`
31. `yucatan`
32. `zacatecas`
