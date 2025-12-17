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
  pass,
  vec2
} from 'three/tsl'
import { gaussianBlur } from 'three/examples/jsm/tsl/display/GaussianBlurNode.js'
import WebGPU from 'three/addons/capabilities/WebGPU.js'
import { WebGPURenderer, MeshBasicNodeMaterial } from 'three/webgpu'
import { PostProcessing } from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// Variables globales
let scene, camera, renderer, controls
let model, water, sun, postProcessing
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
    50,
    window.innerWidth / window.innerHeight,
    0.25,
    30
  )
  camera.position.set(3, 2, 4)

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
  controls.minDistance = 1
  controls.maxDistance = 10
  controls.maxPolarAngle = Math.PI * 0.9
  controls.target.set(0, 0.2, 0)
  controls.update()

  // Configurar iluminación
  setupLights()

  // Cargar modelo GLTF
  await loadGLTFModel()

  // Crear agua con efectos WebGPU
  createWater()

  // Cielo deshabilitado - usa fondo de gradiente WebGPU en scene.backgroundNode
  // createSky()

  // Configurar post-processing para efecto submarino
  setupPostProcessing()

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

// Cargar modelo GLTF
const loadGLTFModel = () => {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()

    loader.load(
      'escena.glb',
      gltf => {
        model = gltf.scene

        // Escalar el modelo para que se vea completo
        model.scale.set(0.1, 0.1, 0.1)
        model.position.set(0, 0.125, 0)

        // Habilitar sombras y ocultar el agua del modelo
        model.traverse(child => {
          if (child.isMesh) {
            child.castShadow = true
            child.receiveShadow = true

            // Ocultar objetos que sean agua por nombre
            const name = child.name.toLowerCase()
            if (
              name.includes('water') ||
              name.includes('agua') ||
              name.includes('ocean') ||
              name.includes('box002') // El objeto agua del modelo anterior
            ) {
              child.visible = false
              console.log('✓ Agua del modelo ocultada:', child.name)
            }
          }
        })

        scene.add(model)
        console.log('Modelo GLTF cargado:', model)
        resolve(gltf)
      },
      xhr => {
        const percentComplete = (xhr.loaded / xhr.total) * 100
        document.getElementById(
          'loading'
        ).textContent = `Cargando modelo: ${Math.round(percentComplete)}%`
      },
      error => {
        console.error('Error cargando GLTF:', error)
        document.getElementById('loading').innerHTML =
          'Error cargando el modelo'
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
  const refractionUV = screenUV.add(vec2(0, waterIntensity.mul(0.1)))
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
  water.position.y = 0.2 // Altura del agua ajustada

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
    const scenePassDepth = scenePass.getLinearDepthNode()

    // Máscara de agua: detecta si la cámara está bajo el agua
    const waterMask = screenUV
      .distance(0.5)
      .mul(1.35)
      .clamp()
      .oneMinus()
      .mul(scenePassDepth.mul(camera.near))

    // Blur con intensidad variable según profundidad
    const scenePassColorBlurred = gaussianBlur(scenePassColor)
    scenePassColorBlurred.directionNode = waterMask.select(
      scenePassDepth,
      scenePassDepth.mul(5)
    )

    // Vignette effect
    const vignette = screenUV.distance(0.5).mul(1.35).clamp().oneMinus()

    // Output: waterMask true = bajo el agua (azul+blur+vignette), false = arriba (normal con blur leve)
    postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = waterMask.select(
      scenePassColorBlurred,
      scenePassColorBlurred.mul(color(0x74ccf4)).mul(vignette)
    )

    console.log('Post-processing configurado correctamente')
  } catch (error) {
    console.error('Error configurando post-processing:', error)
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

  // Renderizar con post-processing o directamente
  if (postProcessing) {
    postProcessing.render()
  } else {
    renderer.render(scene, camera)
  }
}

// Inicializar aplicación
init().catch(console.error)
