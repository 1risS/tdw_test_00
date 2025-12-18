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
  vec2,
  vec3,
  uniform
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
let cameraYUniform, waterHeightUniform // Uniforms para detectar posición bajo el agua

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
  scene.fog = new THREE.Fog(0xff9966, 7, 25) // Niebla color atardecer

  // Cielo procedural de atardecer con nubes
  const skyDirection = normalWorld.normalize()
  const sunsetHorizon = skyDirection.y.add(0.1).saturate()

  // Colores del atardecer
  const skyTop = color(0x0033aa) // Azul oscuro arriba
  const skyHorizon = color(0xff6b35) // Naranja intenso horizonte
  const skyBottom = color(0xffaa66) // Naranja claro abajo

  // Gradiente base del cielo
  const skyGradient = sunsetHorizon
    .greaterThan(0.5)
    .select(
      skyTop.mix(skyHorizon, sunsetHorizon.sub(0.5).mul(2)),
      skyBottom.mix(skyHorizon, sunsetHorizon.mul(2))
    )

  // Nubes procedurales en movimiento
  const cloudTime = time.mul(0.05)
  const cloudUV = vec3(
    skyDirection.x.mul(3).add(cloudTime),
    skyDirection.y.mul(2),
    skyDirection.z.mul(3)
  )

  const clouds = mx_worley_noise_float(cloudUV).oneMinus()
  const cloudMask = clouds.pow(3).mul(0.6) // Nubes suaves

  // Mezclar cielo con nubes
  const cloudColor = color(0xffddbb) // Color cálido de nubes al atardecer
  scene.backgroundNode = skyGradient.mix(cloudColor, cloudMask)

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
  // Luz del sol (atardecer)
  const sunLight = new THREE.DirectionalLight(0xffaa66, 4)
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
  sunLight.position.set(0.5, 1.5, 0.5) // Sol más bajo (atardecer)
  scene.add(sunLight)

  // Luz ambiente cálida del atardecer
  const waterAmbientLight = new THREE.HemisphereLight(0xff9966, 0x74ccf4, 3)
  scene.add(waterAmbientLight)

  // Luz ambiente del cielo
  const skyAmbientLight = new THREE.HemisphereLight(0xff8844, 0, 1)
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
        model.position.set(0, 0.3, 0)

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

        // Agregar caustics después de agregar a la escena
        addCaustics()

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

  // Agregar caustics si el modelo ya está cargado
  if (model) {
    addCaustics()
  }
}

// Agregar caustics (reflejos de luz) a objetos bajo el agua
const addCaustics = () => {
  if (!model || !water) return

  // Crear los nodos TSL fuera del traverse
  const timer = time.mul(0.8)
  const waterPosY = positionWorld.y.sub(water.position.y)

  let transition = waterPosY.add(0.1).saturate().oneMinus()
  transition = waterPosY
    .lessThan(0)
    .select(transition, normalWorld.y.mix(transition, 0))

  const floorUV = positionWorld.xzy
  const waterLayer0 = mx_worley_noise_float(
    floorUV.mul(4).add(timer.mul(0.5))
  ).mul(0.5)

  // Aplicar a cada mesh del modelo
  model.traverse(child => {
    if (child.isMesh && child.visible && child.material) {
      const originalColor = child.material.color || new THREE.Color(0xffffff)
      const baseColor = color(originalColor)

      // Mezclar color base con caustics
      child.material.colorNode = transition.mix(
        baseColor,
        baseColor.add(waterLayer0)
      )
    }
  })

  console.log('✓ Caustics agregados')
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

    // Crear uniforms que detectan si la cámara está bajo el agua
    // Comparando posición Y de la cámara con la altura del agua (0.2)
    cameraYUniform = uniform(camera.position.y)
    waterHeightUniform = uniform(water.position.y)
    const isUnderwater = cameraYUniform.lessThan(waterHeightUniform)

    // Máscara radial para el vignette (solo cuando está sumergido)
    const radialMask = screenUV.distance(0.5).mul(1.35).clamp().oneMinus()

    // Blur con intensidad variable
    const scenePassColorBlurred = gaussianBlur(scenePassColor)
    scenePassColorBlurred.directionNode = scenePassDepth.mul(5)

    // Color del agua para efecto submarino
    const waterColor = color(0x74ccf4)

    // Output: si cámara Y < agua Y → blur+azul+vignette, sino → imagen clara
    postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = isUnderwater.select(
      scenePassColorBlurred.mul(waterColor).mul(radialMask), // Bajo el agua
      scenePassColor // Arriba del agua (imagen clara)
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

  // Actualizar uniform de posición de cámara para detección bajo el agua
  if (cameraYUniform && camera) {
    cameraYUniform.value = camera.position.y
  }

  // Renderizar con post-processing o directamente
  if (postProcessing) {
    postProcessing.render()
  } else {
    renderer.render(scene, camera)
  }
}

// Inicializar aplicación
init().catch(console.error)
