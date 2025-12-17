import * as THREE from 'three'
import {
  color,
  mx_worley_noise_float,
  positionWorld,
  time,
  normalWorld,
  screenUV,
  viewportLinearDepth,
  viewportDepthTexture,
  viewportSharedTexture,
  linearDepth,
  pass
} from 'three/tsl'
import WebGPU from 'three/addons/capabilities/WebGPU.js'
import { WebGPURenderer, MeshBasicNodeMaterial } from 'three/webgpu'
import { PostProcessing } from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'

// Variables globales
let scene, camera, renderer, controls
let fbxModel, water, sun, postProcessing
let clock = new THREE.Clock()

// Configuración inicial
const init = async () => {
  // Verificar soporte WebGPU
  if (WebGPU.isAvailable() === false) {
    document.getElementById('loading').innerHTML =
      'WebGPU no está disponible en este navegador.<br>Necesitas Chrome 113+ o Edge 113+'
    return
  }

  // Crear escena
  scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x0487e2, 7, 25)
  scene.backgroundNode = normalWorld.y.mix(color(0x0487e2), color(0x0066ff))

  // Crear cámara
  camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  )
  camera.position.set(0, 5, 10)

  // Crear renderer WebGPU
  renderer = new WebGPURenderer({
    antialias: false,
    forceWebGL: false
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setAnimationLoop(animate)
  document.getElementById('canvas-container').appendChild(renderer.domElement)

  // Controles de órbita
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.minDistance = 2
  controls.maxDistance = 50
  controls.maxPolarAngle = Math.PI / 2

  // Configurar iluminación
  setupLights()

  // Cargar modelo FBX
  await loadFBXModel()

  // Crear agua con efectos WebGPU
  createWater()

  // Cielo deshabilitado - usa fondo de gradiente WebGPU en scene.backgroundNode
  // createSky()

  // Post-processing deshabilitado debido a incompatibilidad con Sky ShaderMaterial
  // setupPostProcessing()
  postProcessing = null

  // Manejar redimensionamiento
  window.addEventListener('resize', onWindowResize)

  // Ocultar mensaje de carga
  document.getElementById('loading').style.display = 'none'
}

// Configurar luces
const setupLights = () => {
  // Luz del sol
  const sunLight = new THREE.DirectionalLight(0xffe499, 5)
  sunLight.castShadow = true
  sunLight.shadow.camera.near = 0.1
  sunLight.shadow.camera.far = 5
  sunLight.shadow.camera.right = 2
  sunLight.shadow.camera.left = -2
  sunLight.shadow.camera.top = 1
  sunLight.shadow.camera.bottom = -2
  sunLight.shadow.mapSize.width = 2048
  sunLight.shadow.mapSize.height = 2048
  sunLight.shadow.bias = -0.001
  sunLight.position.set(0.5, 3, 0.5)
  scene.add(sunLight)

  // Luz ambiente del agua
  const waterAmbientLight = new THREE.HemisphereLight(0x333366, 0x74ccf4, 5)
  scene.add(waterAmbientLight)

  // Luz ambiente del cielo
  const skyAmbientLight = new THREE.HemisphereLight(0x74ccf4, 0, 1)
  scene.add(skyAmbientLight)
}

// Cargar modelo FBX
const loadFBXModel = () => {
  return new Promise((resolve, reject) => {
    const loader = new FBXLoader()

    loader.load(
      'tdw_scene.fbx',
      fbx => {
        fbxModel = fbx

        // Escalar y posicionar el modelo según sea necesario
        fbxModel.scale.set(0.01, 0.01, 0.01)
        fbxModel.position.set(0, 0.125, 0)

        // Habilitar sombras y ocultar el agua del FBX
        fbxModel.traverse(child => {
          if (child.isMesh) {
            child.castShadow = true
            child.receiveShadow = true

            // Convertir materiales no compatibles a MeshStandardMaterial
            if (child.material) {
              const materials = Array.isArray(child.material)
                ? child.material
                : [child.material]

              const newMaterials = materials.map(material => {
                // Si es ShaderMaterial u otro incompatible, convertir
                if (
                  material.type === 'ShaderMaterial' ||
                  !material.isMeshStandardMaterial
                ) {
                  const newMat = new THREE.MeshStandardMaterial({
                    color: material.color || 0xffffff,
                    map: material.map || null,
                    roughness: 0.8,
                    metalness: 0.2
                  })
                  return newMat
                }
                return material
              })

              child.material = Array.isArray(child.material)
                ? newMaterials
                : newMaterials[0]

              // Detectar y ocultar agua por color
              const material = Array.isArray(child.material)
                ? child.material[0]
                : child.material

              if (material.color) {
                const color = material.color
                const isBlue = color.b > color.r + 0.2 && color.b > 0.4

                if (isBlue) {
                  child.visible = false
                  console.log('✓ Agua del FBX ocultada:', child.name)
                }
              }
            }

            // También ocultar por nombre si contiene "water", "agua", etc.
            const name = child.name.toLowerCase()
            if (
              name.includes('water') ||
              name.includes('agua') ||
              name.includes('ocean')
            ) {
              child.visible = false
              console.log('Agua del FBX ocultada por nombre:', child.name)
            }
          }
        })

        scene.add(fbxModel)
        console.log('Modelo FBX cargado:', fbxModel)
        resolve(fbx)
      },
      xhr => {
        const percentComplete = (xhr.loaded / xhr.total) * 100
        document.getElementById(
          'loading'
        ).textContent = `Cargando modelo: ${Math.round(percentComplete)}%`
      },
      error => {
        console.error('Error cargando FBX:', error)
        document.getElementById('loading').innerHTML =
          'Error cargando el modelo FBX'
        reject(error)
      }
    )
  })
}

// Crear superficie de agua con efectos WebGPU
const createWater = () => {
  // Geometría ultra delgada como en el ejemplo
  const waterGeometry = new THREE.BoxGeometry(100, 0.001, 100)

  // Crear timer para animación
  const timer = time.mul(0.8)
  const floorUV = positionWorld.xzy

  // Crear patrones de ondas con Worley noise
  const waterLayer0 = mx_worley_noise_float(
    floorUV.mul(4).add(timer.mul(0.5))
  ).mul(0.5)
  const waterLayer1 = mx_worley_noise_float(
    floorUV.mul(2).add(timer.mul(0.1))
  ).mul(0.5)

  const waterIntensity = waterLayer0.add(waterLayer1)
  const waterColor = color(0x74ccf4).mul(waterIntensity.add(0.5))

  // Calcular profundidad del agua
  const depth = linearDepth()
  const depthWater = viewportLinearDepth.sub(depth)
  const depthEffect = depthWater.remapClamp(-0.002, 0.04)

  // Configurar UV de refracción
  const refractionUV = screenUV.add(waterIntensity.mul(0.1).toVar())
  const depthTestForRefraction = linearDepth(
    viewportDepthTexture(refractionUV)
  ).sub(depth)
  const depthRefraction = depthTestForRefraction.remapClamp(0, 0.1)

  // UV final con test de profundidad
  const finalUV = depthTestForRefraction
    .lessThan(0)
    .select(screenUV, refractionUV)
  const viewportTexture = viewportSharedTexture(finalUV)

  // Crear material con backdrop nodes
  const waterMaterial = new MeshBasicNodeMaterial()
  waterMaterial.colorNode = waterColor
  waterMaterial.backdropNode = depthEffect.mix(
    viewportSharedTexture(),
    viewportTexture.mul(depthRefraction.mix(1, waterColor))
  )
  waterMaterial.backdropAlphaNode = depthRefraction.oneMinus()
  waterMaterial.transparent = true

  water = new THREE.Mesh(waterGeometry, waterMaterial)
  water.position.y = 0

  scene.add(water)
  console.log('Agua WebGPU creada con refracción y efectos de profundidad')
}

// Crear cielo - DESHABILITADO (Sky usa ShaderMaterial incompatible con WebGPU)
// El fondo de gradiente se configura en scene.backgroundNode en init()
const createSky = () => {
  // Sky deshabilitado - el gradiente ya está configurado en la inicialización
  sun = new THREE.Vector3(0.5, 1, 0.5)
}

// Configurar post-processing para efecto submarino
const setupPostProcessing = () => {
  try {
    const scenePass = pass(scene, camera)
    const scenePassColor = scenePass.getTextureNode()

    // Crear máscara de agua basada en profundidad
    const scenePassDepth = scenePass.getLinearDepthNode().remapClamp(0.15, 0.3)

    const waterMask = screenUV
      .distance(0.5)
      .oneMinus()
      .mul(3)
      .saturate()
      .mul(scenePassDepth.oneMinus())

    const waterColor = color(0x0487e2).mul(waterMask)

    // Aplicar color del agua con vignette
    const waterColorPass = scenePassColor
      .mul(waterMask.oneMinus())
      .add(waterColor)

    postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = waterColorPass
  } catch (error) {
    console.warn('Error configurando post-processing:', error)
    // Deshabilitar post-processing si falla
    postProcessing = null
  }
}

// Manejar redimensionamiento de ventana
const onWindowResize = () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

// Loop de animación
const animate = () => {
  // Actualizar controles
  controls.update()

  // Renderizar escena directamente (post-processing deshabilitado)
  renderer.render(scene, camera)
}

// Inicializar aplicación
init().catch(console.error)
