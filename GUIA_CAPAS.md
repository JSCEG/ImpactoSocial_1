# Guía de Capas del Geovisualizador

Este documento describe las capas GeoJSON utilizadas en el proyecto, sus nombres internos, archivos correspondientes y las propiedades disponibles para el consumo de datos.

## Tabla de Capas

| Nombre Interno          | Nombre Visual            | Archivo                           |
| ----------------------- | ------------------------ | --------------------------------- |
| `localidades`         | Localidades              | `localidades_4326.geojson`      |
| `localidades_puntos`  | Localidades (Puntos)     | `localidades_puntos.geojson`    |
| `atlas`               | Atlas Pueblos Indígenas | `atlaspueblosindigenas.geojson` |
| `municipios`          | Municipios               | `municipios_4326.geojson`       |
| `regiones`            | Regiones Indígenas      | `regionesindigenas.geojson`     |
| `ran`                 | RAN                      | `RAN_4326.geojson`              |
| `lenguas`             | Lenguas Indígenas       | `lenguasindigenas.geojson`      |
| `za_publico`          | ZA Público              | `ZA_publico.geojson`            |
| `za_publico_a`        | ZA Público A            | `ZA_publico_a.geojson`          |
| `anp_estatal`         | ANP Estatales            | `anp_estatal.geojson`           |
| `ramsar`              | Ramsar                   | `ramsar.geojson`                |
| `sitio_arqueologico`  | Sitios Arqueológicos    | `sitio_arqueologico.geojson`    |
| `z_historicos`        | Zonas Históricas        | `z_historicos.geojson`          |
| `loc_indigenas_datos` | Loc Indígenas Datos     | `loc_indigenas_datos.geojson`   |
| `rutaWixarika`        | Ruta Wixarika            | `rutaWixarika.geojson`          |

---

## Detalle de Propiedades por Capa

A continuación se detallan las propiedades (campos) disponibles en cada archivo GeoJSON, útiles para configurar popups, filtros o análisis.

### 1. Localidades (`localidades`)

**Archivo:** `Gabvy_localidades_4326.geojson`

| Propiedad   | Descripción / Ejemplo                  |
| ----------- | --------------------------------------- |
| `CVEGEO`  | Identificador único (Ej:`010060024`) |
| `CVE_ENT` | Clave Entidad (Ej:`01`)               |
| `CVE_MUN` | Clave Municipio (Ej:`006`)            |
| `CVE_LOC` | Clave Localidad (Ej:`0024`)           |
| `NOMGEO`  | Nombre (Ej:`Ojo Zarco [Colonia]`)     |
| `AMBITO`  | Ámbito (Ej:`Rural`)                  |

### 2. Localidades Puntos (`localidades_puntos`)

**Archivo:** `Gabvy_localidades_puntos.geojson`

| Propiedad   | Descripción / Ejemplo                   |
| ----------- | ---------------------------------------- |
| `NOM_ENT` | Nombre Entidad (Ej:`Aguascalientes`)   |
| `NOM_MUN` | Nombre Municipio (Ej:`Aguascalientes`) |
| `NOM_LOC` | Nombre Localidad (Ej:`Aguascalientes`) |
| `POBTOT`  | Población Total (Ej:`863893`)         |
| `POBFEM`  | Población Femenina                      |
| `POBMAS`  | Población Masculina                     |
| `CVE_ENT` | Clave Entidad                            |
| `CVE_MUN` | Clave Municipio                          |
| `CVE_LOC` | Clave Localidad                          |
| `CVEGEO`  | Identificador único                     |

### 3. Atlas Pueblos Indígenas (`atlas`)

**Archivo:** `Gabvy_atlaspueblosindigenas.geojson`

| Propiedad     | Descripción / Ejemplo                  |
| ------------- | --------------------------------------- |
| `CVEGEO`    | Clave Geográfica (Ej:`040040191`)    |
| `Localidad` | Nombre Localidad (Ej:`MAYA TECÚN I`) |

### 4. Municipios (`municipios`)

**Archivo:** `Gabvy_municipios_4326.geojson`

| Propiedad  | Descripción / Ejemplo                   |
| ---------- | ---------------------------------------- |
| `CVEGEO` | Clave Geográfica (Ej:`01001`)         |
| `NOMGEO` | Nombre Municipio (Ej:`Aguascalientes`) |

### 5. Regiones Indígenas (`regiones`)

**Archivo:** `Gabvy_regionesindigenas.geojson`

| Propiedad | Descripción / Ejemplo                   |
| --------- | ---------------------------------------- |
| `Name`  | Nombre Región (Ej:`Altos de Chiapas`) |

### 6. RAN (`ran`)

**Archivo:** `Gabvy_RAN_4326.geojson`

| Propiedad     | Descripción / Ejemplo                 |
| ------------- | -------------------------------------- |
| `MUNICIPIO` | Municipio (Ej:`CARMEN`)              |
| `Clv_Unica` | Clave Única (Ej:`04003E1608110007`) |
| `tipo`      | Tipo (Ej:`Ejido`)                    |

### 7. Lenguas Indígenas (`lenguas`)

**Archivo:** `Gabvy_lenguasindigenas.geojson`

| Propiedad  | Descripción / Ejemplo          |
| ---------- | ------------------------------- |
| `Lengua` | Nombre Lengua (Ej:`Kickapoo`) |

### 8. ZA Público (`za_publico`)

**Archivo:** `Gabvy_ZA_publico.geojson`

| Propiedad              | Descripción / Ejemplo       |
| ---------------------- | ---------------------------- |
| `Zona Arqueológica` | Nombre (Ej:`Olintepec`)    |
| `Estado`             | Estado (Ej:`Morelos`)      |
| `Municipio`          | Municipio (Ej:`Ayala`)     |
| `Localidad`          | Localidad (Ej:`No aplica`) |

### 9. ZA Público A (`za_publico_a`)

**Archivo:** `Gabvy_ZA_publico_a.geojson`

| Propiedad              | Descripción / Ejemplo       |
| ---------------------- | ---------------------------- |
| `Zona Arqueológica` | Nombre (Ej:`Tetzcotzinco`) |
| `Estado`             | Estado (Ej:`México`)      |
| `Municipio`          | Municipio (Ej:`Texcoco`)   |
| `Localidad`          | Localidad (Ej:`No aplica`) |

### 10. ANP Estatales (`anp_estatal`)

**Archivo:** `Gabvy_anp_estatal.geojson`

| Propiedad   | Descripción / Ejemplo            |
| ----------- | --------------------------------- |
| `NOMBRE`  | Nombre ANP (Ej:`Salto Grande`)  |
| `TIPO`    | Tipo (Ej:`Municipal`)           |
| `CAT_DEC` | Categoría (Ej:`Parque Urbano`) |
| `ENTIDAD` | Entidad (Ej:`Campeche`)         |
| `MUN_DEC` | Municipio (Ej:`Candelaria`)     |

### 11. Ramsar (`ramsar`)

**Archivo:** `Gabvy_ramsar.geojson`

| Propiedad      | Descripción / Ejemplo                  |
| -------------- | --------------------------------------- |
| `RAMSAR`     | Nombre Sitio (Ej:`Estero El Soldado`) |
| `ESTADO`     | Estado (Ej:`Sonora`)                  |
| `MUNICIPIOS` | Municipios (Ej:`Guaymas`)             |

### 12. Sitios Arqueológicos (`sitio_arqueologico`)

**Archivo:** `Gabvy_sitio_arqueologico.geojson`

| Propiedad   | Descripción / Ejemplo             |
| ----------- | ---------------------------------- |
| `nombre`  | Nombre Sitio (Ej:`El Vallecito`) |
| `nom_ent` | Entidad (Ej:`Baja California`)   |
| `nom_mun` | Municipio (Ej:`Tecate`)          |
| `nom_loc` | Localidad (Ej:`Agua de Fierro`)  |

### 13. Zonas Históricas (`z_historicos`)

**Archivo:** `Gabvy_z_historicos.geojson`

| Propiedad     | Descripción / Ejemplo                     |
| ------------- | ------------------------------------------ |
| `Nombre`    | Nombre Zona (Ej:`Zona de Monumentos...`) |
| `Estado`    | Estado (Ej:`México`)                    |
| `Municipio` | Municipio (Ej:`Ecatepec de Morelos`)     |
| `Localidad` | Localidad (Ej:`Ecatepec de Morelos`)     |

### 14. Loc Indígenas Datos (`loc_indigenas_datos`)

**Archivo:** `Gabvy_loc_indigenas_datos.geojson`

| Propiedad      | Descripción / Ejemplo                        |
| -------------- | --------------------------------------------- |
| `ENTIDAD`    | Entidad (Ej:`Aguascalientes`)               |
| `MUNICIPIO`  | Municipio (Ej:`Aguascalientes`)             |
| `LOCALIDAD`  | Localidad (Ej:`Aguascalientes`)             |
| `POBTOTAL`   | Población Total (Ej:`863893`)              |
| `PIHOGARES`  | Población Indígena Hogares                  |
| `pPIHOGARES` | Porcentaje PI Hogares                         |
| `TIPOLOC_PI` | Tipo Loc PI (Ej:`Loc. con menos de 40%...`) |
| `POB_AFRO`   | Población Afrodescendiente                   |
| `pPOB_AFRO`  | Porcentaje Afro                               |
| `TIPOLOC_AF` | Tipo Loc Afro                                 |
| `cve_ent`    | Clave Entidad                                 |
| `cve_mun`    | Clave Municipio                               |
| `cve_loc`    | Clave Localidad                               |
| `cvegeo`     | Clave Geo                                     |

### 15. Ruta Wixarika (`rutaWixarika`)

**Archivo:** `Gabvy_rutaWixarika.geojson`

| Propiedad | Descripción / Ejemplo        |
| --------- | ----------------------------- |
| `Name`  | Nombre (Ej:`Ruta Wixarika`) |

---

> **Nota:** Para consumir estos datos en el visualizador, asegúrese de referenciar las propiedades exactamente como están escritas (distinguen mayúsculas y minúsculas).
