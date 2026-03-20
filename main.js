import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

console.log("Script initializing...");

const canvas = document.getElementById("scene-canvas");
const hero = document.getElementById("hero");
const enterBtn = document.getElementById("enter-btn");
const loadingScreen = document.getElementById("loading-screen");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const ui = document.getElementById("ui");
const panelToggle = document.getElementById("panel-toggle");
const infoPanel = document.getElementById("info-panel");
const hotspotLayer = document.getElementById("hotspot-layer");
const prompt = document.getElementById("interaction-prompt");
const backBtn = document.getElementById("back-btn");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const guideBtn = document.getElementById("guide-btn");

console.log("DOM elements loaded:", { canvas, hero, enterBtn, ui });

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
scene.fog = new THREE.FogExp2(0x0a0f14, 0.0008);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.01, 2500);
camera.position.set(0, 1.7, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if ("physicallyCorrectLights" in renderer) {
  renderer.physicallyCorrectLights = true;
}

// Pointer lock provides first-person look control and immersive movement.
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

let modelRoot = null;
const modelMeshes = [];
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const movement = { forward: false, backward: false, left: false, right: false };
const velocity = new THREE.Vector3();
const moveSpeed = 20;
let cameraFloorY = 1.7;
let guidedMode = false;
let guideLerp = 0;
let isNight = true;
let hasStarted = false;
let lastActivity = performance.now();

const IS_VERCEL_DEPLOY =
  window.location.hostname.endsWith("vercel.app") || window.location.hostname.includes("-git-");
const ASSET_BASE = IS_VERCEL_DEPLOY
  ? "https://media.githubusercontent.com/media/dhruvm-04/VirtualTour/main/assets"
  : "assets";

const MODEL_PATHS = {
  mainBlock: `${ASSET_BASE}/mainblock.glb`,
  classroom: `${ASSET_BASE}/classroom.glb`,
  lift: `${ASSET_BASE}/lift.glb`,
};

const MODEL_SPAWN = {
  [MODEL_PATHS.mainBlock]: { eyeHeightMin: 4, eyeHeightRatio: 0.067, eyeHeightMax: 7, zOffsetRatio: 0.18 },
  [MODEL_PATHS.classroom]: { eyeHeightMin: 6, eyeHeightRatio: 0.16, eyeHeightMax: 4.2, zOffsetRatio: 0.04 },
  [MODEL_PATHS.lift]: { eyeHeightMin: 3.6, eyeHeightRatio: 0.96, eyeHeightMax: 5.28, zOffsetRatio: 0 },
};

let activeModelPath = MODEL_PATHS.mainBlock;

const hotspotData = [
  { id: "classrooms", label: "Lift", position: new THREE.Vector3(), mesh: null, button: null },
  { id: "labs", label: "Lab", position: new THREE.Vector3(), mesh: null, button: null },
  { id: "infrastructure", label: "Classroom", position: new THREE.Vector3(), mesh: null, button: null },
];

const guidePath = [
  new THREE.Vector3(0, 1.7, 0),
  new THREE.Vector3(3.5, 1.7, -6),
  new THREE.Vector3(-4, 1.7, -12),
  new THREE.Vector3(-2.5, 1.7, -18),
  new THREE.Vector3(2.5, 1.7, -24),
];

const manager = new THREE.LoadingManager();
manager.onProgress = (_, loaded, total) => {
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
  progressBar.style.width = `${pct}%`;
  progressText.textContent = `${pct}%`;
};
manager.onError = (url) => {
  console.error("Failed to load asset:", url);
};
manager.onLoad = () => {
  setTimeout(() => loadingScreen.classList.remove("visible"), 320);
};

const gltfLoader = new GLTFLoader(manager);
const exrLoader = new EXRLoader(manager);

const ambient = new THREE.HemisphereLight(0xd8e4f0, 0x3a4450, 0.72);
scene.add(ambient);

const key = new THREE.DirectionalLight(0xffffff, 3.2);
key.position.set(24, 32, 18);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1;
key.shadow.camera.far = 120;
key.shadow.radius = 5;
scene.add(key);

const fill = new THREE.PointLight(0xc9dce8, 1.1, 60, 2);
fill.position.set(-6, 4, -8);
scene.add(fill);

const accent = new THREE.PointLight(0xa8bfd4, 0.65, 50, 2.2);
accent.position.set(8, 2.5, 6);
scene.add(accent);

const ambientBottom = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientBottom);

// Load EXR environment map for realistic PBR reflections and lighting
exrLoader.load(
  `${ASSET_BASE}/grasslands_sunset_2k.exr`,
  (envTex) => {
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = envTex;
    scene.background = envTex;
    console.log("HDRI environment loaded successfully");
  },
  undefined,
  (error) => {
    console.warn("HDRI failed to load, using fallback:", error);
  }
);

loadModel(MODEL_PATHS.mainBlock);
createHotspotMarkers();
bindEvents();
animate();

console.log("Initialization complete. Waiting for Enter button click...");

function loadModel(modelPath, onComplete) {
  gltfLoader.load(
    modelPath,
    (gltf) => {
      console.log("Model loaded successfully", gltf);

      if (modelRoot) {
        scene.remove(modelRoot);
      }
      modelMeshes.length = 0;

      modelRoot = gltf.scene;
      modelRoot.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
          node.frustumCulled = false;
          if (node.material) {
            node.material.envMapIntensity = 1.15;
            node.material.needsUpdate = true;
          }
          modelMeshes.push(node);
        }
      });

      logModelTextureDiagnostics(modelRoot, modelPath);

      const box = new THREE.Box3().setFromObject(modelRoot);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const spawnTuning = MODEL_SPAWN[modelPath] ?? MODEL_SPAWN[MODEL_PATHS.mainBlock];
      const eyeHeight = Math.min(
        spawnTuning.eyeHeightMax,
        Math.max(spawnTuning.eyeHeightMin, size.y * spawnTuning.eyeHeightRatio)
      );

      console.log("Model bounds:", { center, size });

      // Camera starts inside the model to begin the walkthrough in-context.
      const startPos = new THREE.Vector3(
        center.x,
        box.min.y + eyeHeight,
        center.z + size.z * spawnTuning.zOffsetRatio
      );
      console.log("Start position:", startPos);

      controls.getObject().position.copy(startPos);
      cameraFloorY = startPos.y;
      velocity.set(0, 0, 0);

      // Hotspots are distributed along the interior axis of the building volume.
      hotspotData[0].position.set(center.x + size.x * 0.15, startPos.y + 0.25, center.z + size.z * 0.1);
      hotspotData[1].position.set(center.x - size.x * 0.22, startPos.y + 0.25, center.z - size.z * 0.15);
      hotspotData[2].position.set(center.x, startPos.y + 0.25, center.z - size.z * 0.33);

      guidePath[0].copy(startPos);
      guidePath[1].set(center.x + size.x * 0.2, startPos.y, center.z + size.z * 0.04);
      guidePath[2].set(center.x - size.x * 0.2, startPos.y, center.z - size.z * 0.16);
      guidePath[3].set(center.x + size.x * 0.05, startPos.y, center.z - size.z * 0.28);
      guidePath[4].set(center.x, startPos.y, center.z - size.z * 0.38);

      scene.add(modelRoot);
      activeModelPath = modelPath;
      updateBackButtonVisibility();
      console.log("Model added to scene");
      loadingScreen.classList.remove("visible");

      if (typeof onComplete === "function") {
        onComplete();
      }
    },
    (xhr) => {
      if (xhr.lengthComputable) {
        const percentComplete = (xhr.loaded / xhr.total) * 100;
        console.log("Model loading:", percentComplete + "%");
        progressBar.style.width = `${percentComplete}%`;
        progressText.textContent = `${Math.round(percentComplete)}%`;
      }
    },
    (error) => {
      loadingScreen.classList.add("visible");
      progressText.textContent = "Model failed to load";
      console.error("Model loading error:", error);
    }
  );
}

function logModelTextureDiagnostics(root, modelPath) {
  const textureSlots = [
    "map",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "emissiveMap",
    "aoMap",
    "alphaMap",
  ];

  let textureRefCount = 0;
  let textureWithImageCount = 0;

  root.traverse((node) => {
    if (!node.isMesh || !node.material) {
      return;
    }

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((mat) => {
      textureSlots.forEach((slot) => {
        const tex = mat[slot];
        if (!tex) {
          return;
        }

        textureRefCount += 1;
        if (tex.image) {
          textureWithImageCount += 1;
          return;
        }

        console.warn("Texture reference without image data", {
          modelPath,
          mesh: node.name || "(unnamed mesh)",
          material: mat.name || "(unnamed material)",
          slot,
        });
      });
    });
  });

  console.log("Model texture diagnostic", {
    modelPath,
    textureRefCount,
    textureWithImageCount,
  });

  if (textureRefCount === 0) {
    console.warn(
      "No image-based textures found in model materials. If this model looks textured in Blender, those are likely procedural nodes and must be baked to image textures before GLB export."
    );
  }
}

function createHotspotMarkers() {
  hotspotData.forEach((item) => {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 18, 18),
      new THREE.MeshBasicMaterial({ color: 0xd5e7f7, transparent: true, opacity: 0.95 })
    );
    marker.visible = false;
    marker.userData.topic = item.id;
    item.mesh = marker;
    scene.add(marker);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.label;
    button.className = "hotspot-btn";
    button.addEventListener("click", () => setActiveCard(item.id));
    hotspotLayer.appendChild(button);
    item.button = button;
  });
}

function bindEvents() {
  if (!enterBtn) {
    console.error("Enter button not found in DOM");
    return;
  }
  
  enterBtn.addEventListener("click", () => {
    console.log("Enter button clicked");
    hasStarted = true;
    hero.style.display = "none";
    hero.classList.remove("visible");
    
    try {
      controls.lock();
      console.log("Pointer lock requested");
    } catch (e) {
      console.error("Pointer lock failed:", e);
    }
    resetInactivity();
  });

  controls.addEventListener("lock", () => {
    console.log("Pointer lock successful");
    prompt.classList.add("hidden");
  });

  controls.addEventListener("unlock", () => {
    console.log("Pointer locked released");
    prompt.classList.remove("hidden");
    ui.classList.remove("ui-hidden");
  });

  canvas.addEventListener("click", () => {
    if (!controls.isLocked && hasStarted) {
      controls.lock();
    }
  });

  panelToggle.addEventListener("click", () => {
    infoPanel.classList.toggle("collapsed");
    resetInactivity();
  });

  // Clicking an info card allows direct contextual actions such as teleport.
  infoPanel.addEventListener("click", (event) => {
    const card = event.target.closest(".info-card");
    if (!card) {
      return;
    }
    setActiveCard(card.dataset.topic);
  });

  fullscreenBtn.addEventListener("click", toggleFullscreen);
  guideBtn.addEventListener("click", toggleGuidedMode);
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      teleportToMainBlock();
      resetInactivity();
    });
  }

  window.addEventListener("resize", onResize);
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  document.addEventListener("mousemove", resetInactivity);
  document.addEventListener("mousedown", resetInactivity);
  document.addEventListener("touchstart", resetInactivity, { passive: true });
}

function onKeyDown(event) {
  if (event.code === "KeyW") movement.forward = true;
  if (event.code === "KeyS") movement.backward = true;
  if (event.code === "KeyA") movement.left = true;
  if (event.code === "KeyD") movement.right = true;
  if (event.code === "KeyG") toggleGuidedMode();
  if (event.code === "KeyF") toggleFullscreen();
  resetInactivity();
}

function onKeyUp(event) {
  if (event.code === "KeyW") movement.forward = false;
  if (event.code === "KeyS") movement.backward = false;
  if (event.code === "KeyA") movement.left = false;
  if (event.code === "KeyD") movement.right = false;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function moveCamera(delta) {
  if (!controls.isLocked || guidedMode) {
    return;
  }

  const forwardDir = new THREE.Vector3();
  camera.getWorldDirection(forwardDir);
  forwardDir.y = 0;
  forwardDir.normalize();

  const sideDir = new THREE.Vector3().crossVectors(forwardDir, camera.up).normalize();
  const targetVelocity = new THREE.Vector3();

  if (movement.forward) targetVelocity.add(forwardDir);
  if (movement.backward) targetVelocity.sub(forwardDir);
  if (movement.left) targetVelocity.sub(sideDir);
  if (movement.right) targetVelocity.add(sideDir);

  if (targetVelocity.lengthSq() > 0) {
    targetVelocity.normalize().multiplyScalar(moveSpeed);
  }

  velocity.lerp(targetVelocity, Math.min(1, delta * 9));

  const nextPos = controls.getObject().position.clone();
  const step = velocity.clone().multiplyScalar(delta);
  const horizontalStep = new THREE.Vector3(step.x, 0, step.z);

  if (!hasCollision(nextPos, horizontalStep)) {
    nextPos.add(horizontalStep);
  }

  nextPos.y = cameraFloorY;
  controls.getObject().position.copy(nextPos);
}

function hasCollision(position, stepVec) {
  if (!modelMeshes.length || stepVec.lengthSq() < 0.00001) {
    return false;
  }

  const direction = stepVec.clone().normalize();
  const origin = position.clone();
  origin.y -= 0.55;
  raycaster.set(origin, direction);
  raycaster.far = Math.max(0.42, stepVec.length() * 1.8);
  const intersections = raycaster.intersectObjects(modelMeshes, false);
  return intersections.length > 0;
}

function updateGuidedPath(delta) {
  if (!guidedMode || !modelRoot) {
    return;
  }

  const totalSegments = guidePath.length - 1;
  guideLerp += delta * 0.08;
  const t = (Math.sin(guideLerp * Math.PI * 2) + 1) * 0.5;
  const scaled = t * totalSegments;
  const index = Math.floor(scaled);
  const localT = scaled - index;

  const from = guidePath[index];
  const to = guidePath[Math.min(index + 1, totalSegments)];
  const targetPos = new THREE.Vector3().lerpVectors(from, to, localT);
  controls.getObject().position.lerp(targetPos, Math.min(1, delta * 1.7));

  const nextIndex = Math.min(index + 1, totalSegments);
  const lookTarget = guidePath[nextIndex].clone();
  camera.lookAt(lookTarget);
}

function updateHotspots() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  hotspotData.forEach((item) => {
    if (!item.mesh || !item.button || !modelRoot) {
      return;
    }

    item.mesh.position.copy(item.position);
    item.mesh.visible = !controls.isLocked;

    const projected = item.position.clone().project(camera);
    const isVisible = projected.z < 1 && projected.z > -1;
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (projected.y * -0.5 + 0.5) * height;

    item.button.style.left = `${x}px`;
    item.button.style.top = `${y}px`;
    item.button.classList.toggle("visible", isVisible && !controls.isLocked && hasStarted);
  });
}

function setActiveCard(topic) {
  const cards = infoPanel.querySelectorAll(".info-card");
  cards.forEach((card) => card.classList.toggle("active", card.dataset.topic === topic));
  infoPanel.classList.remove("collapsed");

  // Topic mapping in current UI copy:
  // "classrooms" => Lift
  // "infrastructure" => Classroom (teleport to classroom model)
  if (topic === "classrooms") {
    teleportToLift();
  }

  if (topic === "infrastructure") {
    teleportToClassroom();
  }

  resetInactivity();
}

function teleportToClassroom() {
  if (activeModelPath === MODEL_PATHS.classroom) {
    return;
  }

  guidedMode = false;
  guideBtn.textContent = "Guided Path";
  loadingScreen.classList.add("visible");
  progressText.textContent = "Teleporting to Classroom...";

  loadModel(MODEL_PATHS.classroom, () => {
    progressText.textContent = "100%";
  });
}

function teleportToLift() {
  if (activeModelPath === MODEL_PATHS.lift) {
    return;
  }

  guidedMode = false;
  guideBtn.textContent = "Guided Path";
  loadingScreen.classList.add("visible");
  progressText.textContent = "Teleporting to Lift...";

  loadModel(MODEL_PATHS.lift, () => {
    progressText.textContent = "100%";
  });
}

function teleportToMainBlock() {
  if (activeModelPath === MODEL_PATHS.mainBlock) {
    return;
  }

  guidedMode = false;
  guideBtn.textContent = "Guided Path";
  loadingScreen.classList.add("visible");
  progressText.textContent = "Returning to Main Block...";

  loadModel(MODEL_PATHS.mainBlock, () => {
    progressText.textContent = "100%";
  });
}

function updateBackButtonVisibility() {
  if (!backBtn) {
    return;
  }
  backBtn.hidden = activeModelPath === MODEL_PATHS.mainBlock;
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => undefined);
  } else {
    document.exitFullscreen().catch(() => undefined);
  }
  resetInactivity();
}

function toggleGuidedMode() {
  guidedMode = !guidedMode;
  guideBtn.textContent = guidedMode ? "Guided: On" : "Guided Path";
  if (guidedMode && controls.isLocked) {
    controls.unlock();
  }
  resetInactivity();
}

function resetInactivity() {
  lastActivity = performance.now();
  if (!infoPanel.classList.contains("collapsed")) {
    ui.classList.remove("ui-hidden");
  }
}

function updateImmersiveUI(now) {
  if (!controls.isLocked || infoPanel.classList.contains("collapsed") === false) {
    return;
  }

  const idleMs = now - lastActivity;
  if (idleMs > 2200) {
    ui.classList.add("ui-hidden");
  } else {
    ui.classList.remove("ui-hidden");
  }
}

function animate() {
  const delta = Math.min(0.05, clock.getDelta());
  const now = performance.now();

  moveCamera(delta);
  updateGuidedPath(delta);
  updateHotspots();
  updateImmersiveUI(now);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
