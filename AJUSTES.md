# Guía de Ajustes para tu Escena

## 🔧 Ajustes Principales del Agua

### Posición y Tamaño
En `main.js`, función `createWater()` (línea ~130):

```javascript
// TAMAÑO: Ajusta el ancho y largo del plano de agua
const waterGeometry = new THREE.PlaneGeometry(
    100,  // Ancho (ajustar según tu escena)
    100,  // Largo (ajustar según tu escena)
    512,  // Segmentos en X (más = más detalle)
    512   // Segmentos en Y (más = más detalle)
);

// ALTURA: Ajusta la posición vertical del agua
waterMesh.position.y = 0; // Cambia este valor según el nivel del agua en tu FBX
```

### Color del Agua
Línea ~143:
```javascript
const waterColor = color(0x0064b5); // Azul agua
// Otros colores sugeridos:
// 0x006994 - Azul océano oscuro
// 0x0077BE - Azul agua claro
// 0x004D7A - Azul profundo
```

### Movimiento del Agua
Línea ~146-150:
```javascript
const waterEffect = water({
    scale: 2,      // Escala de las ondas (menor = olas más grandes)
    flowX: 0.5,    // Velocidad flujo horizontal (negativo = dirección opuesta)
    flowY: 0.5,    // Velocidad flujo vertical
    normalMap0: waterColorTexture,
    normalMap1: waterColorTexture,
});
```

### Transparencia y Brillo
Línea ~157-159:
```javascript
waterMaterial.roughness = 0.1;   // Rugosidad (0 = espejo, 1 = mate)
waterMaterial.metalness = 0.1;   // Metálico (0 = no metálico, 1 = muy metálico)
waterMaterial.opacity = 0.9;     // Transparencia (0 = invisible, 1 = opaco)
```

## 📦 Ajustes del Modelo FBX

En `main.js`, función `loadFBXModel()` (línea ~80):

```javascript
// ESCALA: Si el modelo es muy grande o pequeño
fbxModel.scale.set(0.01, 0.01, 0.01);
// Prueba diferentes valores:
// - 0.001 para modelos MUY grandes
// - 0.1 para modelos grandes
// - 1 si el modelo está en escala correcta

// POSICIÓN: Centrar el modelo
fbxModel.position.set(0, 0, 0);
// Ajusta X, Y, Z según necesites
```

## 🎥 Ajustes de Cámara

En `main.js`, función `init()` (línea ~45):

```javascript
// POSICIÓN INICIAL
camera.position.set(0, 5, 10);
// - Primer número (X): izquierda/derecha
// - Segundo número (Y): altura
// - Tercer número (Z): cerca/lejos

// LÍMITES DE ZOOM
controls.minDistance = 2;   // Qué tan cerca se puede acercar
controls.maxDistance = 50;  // Qué tan lejos se puede alejar
```

## ☀️ Ajustes de Iluminación

En `main.js`, función `setupLights()` (línea ~56):

```javascript
// Luz del sol
const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
sunLight.position.set(10, 20, 5); // Posición del sol (X, Y, Z)
// Segunda parámetro (1.0) = intensidad (0-5 típicamente)

// Luz ambiente
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
// Segunda parámetro (0.4) = intensidad general de la escena
```

## 🎨 Color de Fondo (Cielo)

En `main.js`, línea ~29:
```javascript
scene.background = new THREE.Color(0x87ceeb); // Color cielo
// Otros colores sugeridos:
// 0x87CEEB - Azul cielo claro
// 0x5DADE2 - Azul cielo
// 0x1A1A2E - Noche oscura
// 0xFF6B6B - Atardecer rojizo
```

## 🔍 Encontrar el Nivel Correcto del Agua

1. Abre las herramientas de desarrollador (F12)
2. En la consola, verás información del modelo cargado
3. Ajusta `waterMesh.position.y` para que coincida con el nivel del agua en tu FBX
4. Usa los controles para ver el modelo desde diferentes ángulos

## 💡 Tips

- **Rendimiento**: Si la escena va lenta, reduce los segmentos del agua (512 → 256)
- **Reflejos**: Ajusta `toneMappingExposure` (línea ~42) para más/menos brillo (0.5-2.0)
- **Prueba y error**: Guarda cambios y el navegador se recargará automáticamente

## 🚨 Solución de Problemas

### El agua no se ve
- Verifica que `waterMesh.position.y` sea visible en tu escena
- Asegúrate de que el tamaño del plano (`PlaneGeometry`) sea adecuado

### El modelo no carga
- Verifica que `tdw_scene.fbx` esté en la raíz del proyecto
- Revisa la consola del navegador para errores

### El agua no se mueve
- El movimiento es sutil, acércate para verlo mejor
- Ajusta `flowX` y `flowY` a valores más altos (ej: 1.0, 2.0)

### No veo reflejos
- Asegúrate de usar Chrome 113+ o Edge 113+
- WebGPU debe estar habilitado en tu navegador
