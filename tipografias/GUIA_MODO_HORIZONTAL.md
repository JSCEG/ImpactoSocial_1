# 📐 Guía Completa: Modo Horizontal para Figuras SENER

## 🎯 **Objetivo**
Implementar figuras en modo horizontal (landscape) que maximicen el uso del espacio disponible, manteniendo la identidad institucional SENER y garantizando que todo el contenido (caption + figura + fuente) quepa en una sola página.

## 🏗️ **Arquitectura del Sistema**

### **1. Entorno Principal: `figuraespecial`**
```latex
\begin{figuraespecial}
  % Contenido horizontal optimizado
\end{figuraespecial}
```

**Características:**
- Cambia a modo landscape automáticamente (`pdflscape`)
- **Márgenes Rotados (Geometry) - Configuración Final:**
    - `right=3.0cm` → **Visual Top** (Espacio para encabezado y línea dorada)
    - `left=1.5cm` → **Visual Bottom** (Espacio para pie de página y número)
    - `top=2.5cm` → **Visual Right** (Alineado con fin de línea dorada superior)
    - `bottom=2.0cm` → **Visual Left** (Alineado con inicio de líneas doradas)
- Fondo institucional: `img/hojahorizontal.jpg` rotado 90°
- Línea dorada institucional posicionada manualmente con TikZ
- Sin headers/footers (`\thispagestyle{empty}`)

### **2. Variable de Ancho Exclusiva**
```latex
\newlength{\anchoHorizontal}
\setlength{\anchoHorizontal}{1.0\linewidth}
```

**Propósito:**
- Controla el ancho de TODOS los elementos horizontales
- 100% del `\linewidth` (maximizado entre márgenes visuales Left/Right)

### **3. Comandos Específicos Horizontales**

#### **A. Títulos y Secciones**
Para evitar "títulos huérfanos" en la página vertical anterior, **mueve** el comando de sección dentro del entorno `figuraespecial` usando una de estas opciones:

1.  **Título Simple (Solo visual)**
    ```latex
    \tituloHorizontal{Texto del Título}
    ```
    *Estilo*: Sección (Patria 17pt, Guinda). No numera ni añade al índice.

2.  **Sección Numerada (Reemplaza a `\section`)**
    ```latex
    \seccionHorizontal{Nombre de la Sección}
    ```
    *Efecto*: Numera (ej. "6. Balance"), añade al índice y muestra el título estilo Sección.

3.  **Subsección Numerada (Reemplaza a `\subsection`)**
    ```latex
    \subseccionHorizontal{Nombre de la Subsección}
    ```
    *Efecto*: Numera (ej. "6.1 Cuentas..."), añade al índice y muestra el título estilo Subsección (Patria 14pt, Rojo Claro).

**Nota**: Todos estos comandos reducen automáticamente la altura de la imagen para dar cabida al título sin saltar de página.

#### **B. Caption Horizontal**
```latex
\captionHorizontal{Texto del caption}
```
- Fuente: Patria 10pt (compacto)
- Color: gobmxGuinda
- Alineación: **Izquierda** (sin `center`)
- Sin numeración automática

#### **C. Imagen Horizontal**
```latex
\sinNotas % Opcional: Usar ANTES de \imagenHorizontal si la fuente NO tiene notas al pie.
\imagenHorizontal{ruta/imagen.png}{fig:etiqueta}
```
- **Ancho**: `\linewidth` (100% disponible)
- **Alto (Estándar)**: `\textheight - 4.5cm` (Uso normal con o sin notas al pie)
- **Alto (Con \sinNotas)**: `\textheight - 2.0cm` (Maximización extrema: gana 2.5cm extra de altura). **Nota**: Usar solo si la fuente es breve y NO tiene notas al pie.
- **Alineación**: Izquierda
- **Estiramiento**: Forzado (sin `keepaspectratio`)

#### **D. Fuente Horizontal**
```latex
\fuenteHorizontal{Texto de la fuente\footnotemark}
\footnotetext{Texto de la nota al pie}
```
- Fuente: Patria 9pt itálica
- Color: gobmxGris
- Alineación: **Izquierda**
- **Notas al Pie**: Debido a que la fuente está encapsulada en una caja (`parbox`), las notas al pie directas (`\footnote`) no funcionan correctamente. Se debe usar `\footnotemark` dentro de la fuente y `\footnotetext` justo después.63. - Posición: Ajuste vertical de -0.5cm (`vspace`) para acercar a la figura

## 🧭 **Mapeo de Coordenadas TikZ en Landscape**

Cuando se usa `pdflscape`, la página rota visualmente en el PDF, pero el sistema de coordenadas de TikZ (`current page`) sigue anclado a la página física original. Esto causa confusión entre "Arriba/Abajo" visual vs físico.

### **Referencias Comprobadas:**

| Punto Físico TikZ (`current page`) | Ubicación Visual en PDF (Landscape) | Uso en Plantilla |
|------------------------------------|-------------------------------------|------------------|
| `.south west` (0,0) | **Esquina Superior Izquierda** | Inicio de Línea Dorada |
| `.north west` | **Esquina Superior Derecha** | Fin de Línea Dorada |
| `.south east` | **Esquina Inferior Izquierda** | - |
| `.north east` | **Esquina Inferior Derecha** | **Número de Página** |

### **Configuración Final Implementada:**

1.  **Línea Dorada (Encabezado):**
    *   Dibuja de `south west` a `north west`.
    *   Visualmente: Línea horizontal superior de izquierda a derecha.
    *   Offset X: `2.5cm` (Borde Superior Visual).
    *   Inicio Visual Izquierdo: `2cm` (Igual que pie de página).
    *   Fin Visual Derecho: `-2.5cm` (**Configuración Ganadora**).
    *   **Ancho**: `1pt`.

2.  **Número de Página (Pie):**
    *   Ubicado en `north east` (Esquina Inferior Derecha Visual).
    *   Offset: `(-1.3cm, -2.5cm)` para quedar debajo de la cinta dorada del fondo.
    *   Rotación: `rotate=90` para que el texto se lea correctamente en horizontal.

3.  **Línea de Pie de Página (Complemento):**
    *   Dibuja paralela al borde `east` (Visual Bottom).
    *   Desde `north east` (Visual Bottom-Right) hacia `south east` (Visual Bottom-Left).
    *   Offset X: `-1.25cm` (Alineado con la base del número de página).
    *   Inicio Visual Izquierdo: `2cm` del borde `south east` (**Configuración Ganadora**).
    *   Fin Visual Derecho: `-3.0cm` del borde `north east` (Antes del número).
    *   **Ancho**: `1pt`.

## 📋 **Orden de Elementos**
```latex
\begin{figuraespecial}
  \captionHorizontal{Descripción...}
  \imagenHorizontal{ruta...}{fig:...}
  \fuenteHorizontal{Fuente...}
\end{figuraespecial}
```

## 🔄 **Flujo de Trabajo**
1. **Google Sheets**: Columna "Opciones" → `horizontal`.
2. **Generación**: Detecta flag y usa entorno `figuraespecial`.
3. **Compilación**: XeLaTeX aplica rotación y coordenadas TikZ corregidas.

---
**Actualizado**: Enero 2026 - Calibración final de coordenadas.
