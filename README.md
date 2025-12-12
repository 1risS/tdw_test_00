# Three.js Water Scene con FBX

Proyecto de Three.js que carga un modelo FBX y renderiza agua realista con oleaje y reflejos usando WebGPU.

## Características

- 🌊 Agua realista con movimiento y reflejos
- 🎨 Renderizado WebGPU para mejor rendimiento
- 📦 Carga de modelos FBX
- 💡 Sistema de iluminación avanzado
- 🎮 Controles de cámara orbital

## Requisitos

- Node.js 18+ 
- Navegador con soporte WebGPU (Chrome 113+, Edge 113+)

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

El proyecto se abrirá automáticamente en `http://localhost:3000`

## Build para Producción

```bash
npm run build
```

## Controles

- **Click + Arrastrar**: Rotar cámara
- **Rueda del ratón**: Zoom
- **Click derecho + Arrastrar**: Pan

## Configuración del Agua

La posición y tamaño del agua se puede ajustar en `main.js`:

```javascript
// Tamaño del plano de agua
const waterGeometry = new THREE.PlaneGeometry(100, 100, 512, 512);

// Posición vertical del agua
waterMesh.position.y = 0; // Ajustar según la escena
```

## Ajustes del Modelo FBX

En `main.js`, línea ~95:

```javascript
// Escala del modelo
fbxModel.scale.set(0.01, 0.01, 0.01);

// Posición del modelo
fbxModel.position.set(0, 0, 0);
```

## Estructura del Proyecto

```
.
├── index.html          # Página principal
├── main.js            # Lógica principal de Three.js
├── tdw_scene.fbx      # Modelo 3D
├── package.json       # Dependencias
├── vite.config.js     # Configuración de Vite
└── README.md          # Esta documentación
```

## Tecnologías

- [Three.js](https://threejs.org/) - Librería 3D
- [WebGPU](https://www.w3.org/TR/webgpu/) - API de gráficos moderna
- [Vite](https://vitejs.dev/) - Build tool y dev server
# tdw_test_00 # tdw_test_00
