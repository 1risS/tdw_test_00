import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { Water } from 'three/examples/jsm/objects/Water.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'

// Variables globales
let scene, camera, renderer, controls
let fbxModel, water, sun, underwaterOverlay
let clock = new THREE.Clock()

// Configuración inicial
const init = async () => {
  // Crear escena
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x87ceeb) // Color cielo

  // Crear cámara
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  )
  camera.position.set(0, 5, 10)

  // Crear renderer WebGL
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.5
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

  // Crear agua primero
  createWater()

  // Crear cielo
  createSky()

  // Cargar modelo FBX
  await loadFBXModel()

  // Manejar redimensionamiento
  window.addEventListener('resize', onWindowResize)

  // Ocultar mensaje de carga
  document.getElementById('loading').style.display = 'none'

  // Iniciar animación
  animate()
}

// Configurar luces
const setupLights = () => {
  // Luz ambiente
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
  scene.add(ambientLight)

  // Luz direccional (sol)
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.0)
  sunLight.position.set(10, 20, 5)
  sunLight.castShadow = true
  sunLight.shadow.mapSize.width = 2048
  sunLight.shadow.mapSize.height = 2048
  sunLight.shadow.camera.near = 0.5
  sunLight.shadow.camera.far = 50
  scene.add(sunLight)

  // Luz hemisférica para iluminación más natural
  const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x444444, 0.5)
  scene.add(hemiLight)
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

            // Debug: Mostrar todos los meshes con sus colores
            if (child.material) {
              const material = Array.isArray(child.material)
                ? child.material[0]
                : child.material

              if (material.color) {
                console.log('Mesh:', child.name, '| Color RGB:', {
                  r: material.color.r.toFixed(3),
                  g: material.color.g.toFixed(3),
                  b: material.color.b.toFixed(3)
                })
              }
            }

            // Ocultar la geometría del agua (parte celeste/azul del FBX)
            // Detectar por color del material
            if (child.material) {
              const material = Array.isArray(child.material)
                ? child.material[0]
                : child.material

              if (material.color) {
                const color = material.color
                // Detectar colores azules/celestes - RANGO AMPLIADO
                // Azul: B debe ser significativamente mayor que R
                const isBlue = color.b > color.r + 0.2 && color.b > 0.4

                if (isBlue) {
                  child.visible = false
                  console.log(
                    '✓ Agua del FBX ocultada:',
                    child.name,
                    'Color RGB:',
                    {
                      r: color.r.toFixed(3),
                      g: color.g.toFixed(3),
                      b: color.b.toFixed(3)
                    }
                  )
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

// Crear superficie de agua con efectos
const createWater = () => {
  // Usar BoxGeometry muy delgada en lugar de PlaneGeometry
  // Esto evita que el agua desaparezca al cruzarla
  const waterGeometry = new THREE.BoxGeometry(100, 0.1, 100)

  // Crear agua con el módulo Water de Three.js
  water = new Water(waterGeometry, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: new THREE.TextureLoader().load(
      'https://threejs.org/examples/textures/waternormals.jpg',
      function (texture) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      }
    ),
    sunDirection: new THREE.Vector3(),
    sunColor: 0xffffff,
    waterColor: 0x0064b5,
    distortionScale: 3.7,
    fog: scene.fog !== undefined
  })

  water.position.y = 0 // Ajusta la altura según tu modelo

  // Configuración para que el agua sea visible desde ambos lados
  water.material.side = THREE.DoubleSide
  water.material.depthWrite = false
  water.material.depthTest = true
  water.material.transparent = true
  water.renderOrder = 1

  scene.add(water)

  // Crear overlay submarino - plano que sigue la cámara
  const overlayGeometry = new THREE.PlaneGeometry(10, 10) // MUCHO más grande
  const overlayMaterial = new THREE.MeshBasicMaterial({
    color: 0x0064b5,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide
  })
  underwaterOverlay = new THREE.Mesh(overlayGeometry, overlayMaterial)
  underwaterOverlay.renderOrder = 999 // Renderizar al final
  camera.add(underwaterOverlay) // Agregar a la cámara para que la siga
  underwaterOverlay.position.z = -1 // Más cerca de la cámara
  scene.add(camera) // Importante: agregar cámara a la escena para que el overlay funcione

  console.log('Agua creada con efectos realistas y volumen submarino')
}

// Crear cielo
const createSky = () => {
  sun = new THREE.Vector3()

  const sky = new Sky()
  sky.scale.setScalar(10000)
  scene.add(sky)

  const skyUniforms = sky.material.uniforms
  skyUniforms['turbidity'].value = 10
  skyUniforms['rayleigh'].value = 2
  skyUniforms['mieCoefficient'].value = 0.005
  skyUniforms['mieDirectionalG'].value = 0.8

  const parameters = {
    elevation: 2,
    azimuth: 180
  }

  const pmremGenerator = new THREE.PMREMGenerator(renderer)

  function updateSun () {
    const phi = THREE.MathUtils.degToRad(90 - parameters.elevation)
    const theta = THREE.MathUtils.degToRad(parameters.azimuth)

    sun.setFromSphericalCoords(1, phi, theta)

    sky.material.uniforms['sunPosition'].value.copy(sun)
    water.material.uniforms['sunDirection'].value.copy(sun).normalize()

    scene.environment = pmremGenerator.fromScene(sky).texture
  }

  updateSun()
}

// Manejar redimensionamiento de ventana
const onWindowResize = () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

// Loop de animación
const animate = () => {
  requestAnimationFrame(animate)

  const time = clock.getElapsedTime()

  // Actualizar controles
  controls.update()

  // Animar agua
  if (water) {
    water.material.uniforms['time'].value = time
  }

  // Detectar si la cámara está bajo el agua y aplicar efecto submarino
  if (water && underwaterOverlay) {
    const waterLevel = water.position.y
    const isUnderwater = camera.position.y < waterLevel

    if (isUnderwater) {
      // Aplicar niebla celeste submarina
      if (!scene.fog) {
        scene.fog = new THREE.FogExp2(0x0064b5, 0.1) // Color azul agua con densidad aumentada
      }
      scene.background = new THREE.Color(0x0064b5) // Fondo azul agua

      // Fade in del overlay azul - MUCHO más opaco
      underwaterOverlay.material.opacity = Math.min(
        underwaterOverlay.material.opacity + 0.1,
        0.95 // Opacidad casi total
      )
    } else {
      // Restablecer cuando está sobre el agua
      if (scene.fog) {
        scene.fog = null
      }
      scene.background = new THREE.Color(0x87ceeb) // Fondo cielo

      // Fade out del overlay
      underwaterOverlay.material.opacity = Math.max(
        underwaterOverlay.material.opacity - 0.05,
        0
      )
    }
  }

  // Renderizar escena
  renderer.render(scene, camera)
}

// Inicializar aplicación
init().catch(console.error)
