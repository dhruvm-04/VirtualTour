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
const exitLiftBtn = document.getElementById("exit-lift-btn");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const guideBtn = document.getElementById("guide-btn");
const controlsHint = document.querySelector(".controls-hint");
const mobileControls = document.getElementById("mobile-controls");
const movePad = document.getElementById("move-pad");
const moveThumb = document.getElementById("move-thumb");
const mobilePopup = document.getElementById("mobile-popup");

console.log("DOM elements loaded:", { canvas, hero, enterBtn, ui });

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
scene.fog = new THREE.FogExp2(0x0a0f14, 0.0008);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.01, 2500);
camera.position.set(0, 1.7, 0);
camera.rotation.order = "YXZ";

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
const mobileMovement = { forward: 0, right: 0 };
const velocity = new THREE.Vector3();
const moveSpeed = 20;
let cameraFloorY = 1.7;
let guidedMode = false;
let guideLerp = 0;
let isNight = true;
let hasStarted = false;
let lastActivity = performance.now();
let isMobileView = isMobileViewport();
let lookTouchId = null;
let lastLookX = 0;
let lastLookY = 0;
let moveTouchId = null;
let cameraYaw = 0;
let cameraPitch = 0;
let mobilePopupTimer = null;
let welcomeFadeTimer = null;
let liftCurrentFloor = "G";
let liftTargetFloor = null;
let liftIsMoving = false;
let mainBlockActiveFloor = "G";
let liftTravelStart = 0;
let liftTravelDuration = 0;
let liftTravelRoute = [];
let liftDisplayMesh = null;
let liftDisplayTexture = null;
let liftDisplayCanvas = null;
let liftDisplayContext = null;
let liftDisplayLastText = "";
let liftDisplayOverlay = null;
let mainBlockDefaultEyeY = 1.7;
const liftOverlayScratch = new THREE.Vector3();
const liftButtonMeshes = new Map();
const liftButtonOverlayMap = new Map();
const liftButtonLabels = [];
const liftInteractiveButtons = [];

const FLOOR_ORDER = ["G", "1", "2", "3", "4", "5", "6"];
const FLOOR_TO_INDEX = new Map(FLOOR_ORDER.map((floor, idx) => [floor, idx]));
const LIFT_BUTTON_TO_FLOOR = {
  b1: "5",
  b2: "6",
  b3: "3",
  b4: "4",
  b5: "1",
  b6: "2",
  b7: "G",
};
const LIFT_BUTTON_SYMBOL = {
  b8: "<>",
  b9: "><",
};

const LIFT_EXIT_VIEW_OFFSETS = {
  G: { offset: new THREE.Vector3(-10.9, 0, -11.96), lookOffset: new THREE.Vector3(-5.24, 0, -6.31) },
  1: { offset: new THREE.Vector3(-10.9, 0, -11.96), lookOffset: new THREE.Vector3(-5.24, 0, -6.31) },
  2: { offset: new THREE.Vector3(-10.9, 0, -11.96), lookOffset: new THREE.Vector3(-5.24, 0, -6.31) },
  3: { offset: new THREE.Vector3(-10.9, 0, -11.96), lookOffset: new THREE.Vector3(-5.24, 0, -6.31) },
  4: { offset: new THREE.Vector3(-10.9, 0, -11.96), lookOffset: new THREE.Vector3(-5.24, 0, -6.31) },
  5: { offset: new THREE.Vector3(-10.9, 0, -11.96), lookOffset: new THREE.Vector3(-5.24, 0, -6.31) },
  6: { offset: new THREE.Vector3(-10.9, 0, -11.96), lookOffset: new THREE.Vector3(-5.24, 0, -6.31) },
};

const LIFT_SPAWN_POSITION = new THREE.Vector3(-0.81, 5.28, 0);
const LIFT_SPAWN_LOOK_TARGET = new THREE.Vector3(-5.21, 4.12, -5.96);

const LIFT_EXIT_FLOOR_Y_ADJUST = {
  G: 1.8,
  1: 2.2,
  2: 3.1,
  3: 4.5,
  4: 6.8,
  5: 6.8,
  6: 9.3,
};

const FLOOR_VERTICAL_STEP_SCALE = 1.55;

const IS_VERCEL_DEPLOY =
  window.location.hostname.endsWith("vercel.app") || window.location.hostname.includes("-git-");
const ASSET_BASE = IS_VERCEL_DEPLOY
  ? "https://media.githubusercontent.com/media/dhruvm-04/VirtualTour/main/assets"
  : "assets";

const MODEL_PATHS = {
  mainBlock: `${ASSET_BASE}/mainblocknew.glb`,
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
updateUIForInputMode();
updateRendererForViewport();
setActiveCard("welcome");
bindEvents();
animate();

console.log("Initialization complete. Waiting for Enter button click...");

function loadModel(modelPath, onComplete) {
  gltfLoader.load(
    modelPath,
    (gltf) => {
      console.log("Model loaded successfully", gltf);

      clearLiftRuntimeForModelSwitch(modelPath);

      if (modelRoot) {
        scene.remove(modelRoot);
      }
      modelMeshes.length = 0;
      liftButtonMeshes.clear();
      liftInteractiveButtons.length = 0;

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
      if (modelPath === MODEL_PATHS.mainBlock) {
        mainBlockDefaultEyeY = startPos.y;
      }
      velocity.set(0, 0, 0);

      // Hotspots are distributed along the interior axis of the building volume.
      hotspotData[0].position.set(-3.04, 3.65, -84.22);
      hotspotData[1].position.set(19.25, 3.65, 112.14);
      hotspotData[2].position.set(-68.76, 3.65, -55.18);

      guidePath[0].copy(startPos);
      guidePath[1].set(center.x + size.x * 0.2, startPos.y, center.z + size.z * 0.04);
      guidePath[2].set(center.x - size.x * 0.2, startPos.y, center.z - size.z * 0.16);
      guidePath[3].set(center.x + size.x * 0.05, startPos.y, center.z - size.z * 0.28);
      guidePath[4].set(center.x, startPos.y, center.z - size.z * 0.38);

      scene.add(modelRoot);
      activeModelPath = modelPath;
  configureLiftModelIfNeeded(modelPath);
      updateBackButtonVisibility();
  updateExitLiftButton();
      updateUIForInputMode();
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
      if (!isMobileView) {
        controls.lock();
        console.log("Pointer lock requested");
      } else {
        prompt.classList.add("hidden");
        syncMobileLookFromCamera();
        showMobileJoystickPopup();
      }
    } catch (e) {
      console.error("Pointer lock failed:", e);
    }
    startWelcomeAutoFade();
    resetInactivity();
  });

  controls.addEventListener("lock", () => {
    console.log("Pointer lock successful");
    prompt.classList.add("hidden");
  });

  controls.addEventListener("unlock", () => {
    console.log("Pointer locked released");
    if (!isMobileView) {
      prompt.classList.remove("hidden");
    }
    ui.classList.remove("ui-hidden");
  });

  canvas.addEventListener("click", (event) => {
    if (tryHandleLiftClick(event.clientX, event.clientY)) {
      resetInactivity();
      return;
    }

    if (!isMobileView && !controls.isLocked && hasStarted) {
      controls.lock();
    }
  });

  canvas.addEventListener("touchstart", onCanvasTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onCanvasTouchMove, { passive: false });
  canvas.addEventListener("touchend", onCanvasTouchEnd, { passive: false });
  canvas.addEventListener("touchcancel", onCanvasTouchEnd, { passive: false });

  if (movePad) {
    movePad.addEventListener("touchstart", onMovePadTouchStart, { passive: false });
    movePad.addEventListener("touchmove", onMovePadTouchMove, { passive: false });
    movePad.addEventListener("touchend", onMovePadTouchEnd, { passive: false });
    movePad.addEventListener("touchcancel", onMovePadTouchEnd, { passive: false });
  }

  panelToggle.addEventListener("click", () => {
    stopWelcomeAutoFade();
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

  if (exitLiftBtn) {
    exitLiftBtn.addEventListener("click", () => {
      exitLiftAtCurrentFloor();
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
  if (isMobileView) {
    return;
  }

  if (event.code === "KeyW") movement.forward = true;
  if (event.code === "KeyS") movement.backward = true;
  if (event.code === "KeyA") movement.left = true;
  if (event.code === "KeyD") movement.right = true;
  if (event.code === "KeyG" && activeModelPath !== MODEL_PATHS.lift) toggleGuidedMode();
  if (event.code === "KeyF") toggleFullscreen();
  if (activeModelPath === MODEL_PATHS.lift) {
    if (event.code === "Digit1") queueLiftFloor("1");
    if (event.code === "Digit2") queueLiftFloor("2");
    if (event.code === "Digit3") queueLiftFloor("3");
    if (event.code === "Digit4") queueLiftFloor("4");
    if (event.code === "Digit5") queueLiftFloor("5");
    if (event.code === "Digit6") queueLiftFloor("6");
    if (event.code === "KeyG") queueLiftFloor("G");
    if (event.code === "KeyE") exitLiftAtCurrentFloor();
  }
  if (event.code === "KeyP") {
    const pos = controls.getObject().position;
    const lookDir = new THREE.Vector3();
    camera.getWorldDirection(lookDir);
    const lookPoint = pos.clone().addScaledVector(lookDir, 8);
    console.log(`Camera Position: X=${pos.x.toFixed(2)}, Y=${pos.y.toFixed(2)}, Z=${pos.z.toFixed(2)}`);
    console.log(`Paste this: position: new THREE.Vector3(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`);
    console.log(`Look Target (8m): X=${lookPoint.x.toFixed(2)}, Y=${lookPoint.y.toFixed(2)}, Z=${lookPoint.z.toFixed(2)}`);
    console.log(
      `Preset snippet: { offset: new THREE.Vector3(${(pos.x - hotspotData[0].position.x).toFixed(2)}, 0, ${(pos.z - hotspotData[0].position.z).toFixed(2)}), lookOffset: new THREE.Vector3(${(lookPoint.x - hotspotData[0].position.x).toFixed(2)}, 0, ${(lookPoint.z - hotspotData[0].position.z).toFixed(2)}) }`
    );
  }
  resetInactivity();
}

function onKeyUp(event) {
  if (isMobileView) {
    return;
  }

  if (event.code === "KeyW") movement.forward = false;
  if (event.code === "KeyS") movement.backward = false;
  if (event.code === "KeyA") movement.left = false;
  if (event.code === "KeyD") movement.right = false;
}

function clearLiftRuntimeForModelSwitch(nextModelPath) {
  while (liftButtonLabels.length > 0) {
    const sprite = liftButtonLabels.pop();
    if (sprite.parent) {
      sprite.parent.remove(sprite);
    }
    if (sprite.material?.map) {
      sprite.material.map.dispose();
    }
    sprite.material?.dispose?.();
  }

  if (liftDisplayTexture) {
    liftDisplayTexture.dispose();
    liftDisplayTexture = null;
  }

  liftDisplayCanvas = null;
  liftDisplayContext = null;
  liftDisplayMesh = null;
  liftDisplayLastText = "";

  liftButtonOverlayMap.forEach((overlayEl) => {
    overlayEl.remove();
  });
  liftButtonOverlayMap.clear();

  if (liftDisplayOverlay) {
    liftDisplayOverlay.remove();
    liftDisplayOverlay = null;
  }

  liftIsMoving = false;
  liftTargetFloor = null;
  liftTravelRoute = [];
}

function cloneMeshMaterials(mesh) {
  if (!mesh?.material) {
    return;
  }

  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.map((mat) => (mat?.clone ? mat.clone() : mat));
    return;
  }

  if (mesh.material.clone) {
    mesh.material = mesh.material.clone();
  }
}

function makeLiftSymbolTexture(symbol) {
  const canvasEl = document.createElement("canvas");
  canvasEl.width = 256;
  canvasEl.height = 256;
  const ctx = canvasEl.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.fillStyle = "rgba(0, 0, 0, 0.76)";
  ctx.beginPath();
  ctx.arc(128, 128, 98, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 160, 70, 0.9)";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(128, 128, 98, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#ff9f3f";
  ctx.font = "700 128px Manrope, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(symbol, 128, 134);

  const texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function addLiftButtonLabel(mesh, symbol) {
  const texture = makeLiftSymbolTexture(symbol);
  if (!texture) {
    return;
  }

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.24, 0.24, 1);

  let zOffset = 0.03;
  if (mesh.geometry) {
    mesh.geometry.computeBoundingBox();
    const bbox = mesh.geometry.boundingBox;
    if (bbox) {
      zOffset = (bbox.max.z - bbox.min.z) * 0.55 + 0.02;
    }
  }

  sprite.position.set(0, 0, zOffset);
  sprite.renderOrder = 999;
  mesh.add(sprite);
  liftButtonLabels.push(sprite);
}

function createLiftButtonOverlay(meshName, symbol, mesh) {
  if (!hotspotLayer || !mesh || liftButtonOverlayMap.has(meshName)) {
    return;
  }

  const label = document.createElement("div");
  label.className = "lift-btn-label";
  label.textContent = symbol;

  const mappedFloor = LIFT_BUTTON_TO_FLOOR[meshName];
  if (mappedFloor) {
    label.classList.add("floor-btn");
  } else {
    label.title = symbol === "<>" ? "Door Open (not interactive yet)" : "Door Close (not interactive yet)";
  }

  hotspotLayer.appendChild(label);
  liftButtonOverlayMap.set(meshName, label);
}

function setLiftButtonVisual(mesh, isActive) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((mat) => {
    if (!mat) {
      return;
    }

    if ("emissive" in mat) {
      mat.emissive.setHex(isActive ? 0xff8d2e : 0x000000);
      mat.emissiveIntensity = isActive ? 0.8 : 0;
      mat.needsUpdate = true;
    }
  });
}

function updateLiftButtonVisuals() {
  liftButtonMeshes.forEach((mesh, buttonName) => {
    const mappedFloor = LIFT_BUTTON_TO_FLOOR[buttonName];
    const isCurrent = !liftIsMoving && mappedFloor === liftCurrentFloor;
    const isTarget = liftIsMoving && mappedFloor === liftTargetFloor;
    setLiftButtonVisual(mesh, isCurrent || isTarget);

    const overlay = liftButtonOverlayMap.get(buttonName);
    if (!overlay) {
      return;
    }

    const isFloorButton = Boolean(mappedFloor);
    if (isFloorButton) {
      overlay.classList.toggle("active", isCurrent || isTarget);
    }
  });
}

function ensureLiftDisplayPanel(mesh) {
  liftDisplayCanvas = document.createElement("canvas");
  liftDisplayCanvas.width = 1024;
  liftDisplayCanvas.height = 512;
  liftDisplayContext = liftDisplayCanvas.getContext("2d");
  if (!liftDisplayContext) {
    return;
  }

  liftDisplayTexture = new THREE.CanvasTexture(liftDisplayCanvas);
  liftDisplayTexture.colorSpace = THREE.SRGBColorSpace;
  liftDisplayTexture.minFilter = THREE.LinearFilter;
  liftDisplayTexture.magFilter = THREE.LinearFilter;
  liftDisplayTexture.needsUpdate = true;

  const panelMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: liftDisplayTexture,
    transparent: false,
    side: THREE.DoubleSide,
  });

  mesh.material = panelMaterial;
  liftDisplayMesh = mesh;
  ensureLiftDisplayOverlay();
  updateLiftDisplayText(`FLOOR ${liftCurrentFloor}`, "Select a floor");
}

function ensureLiftDisplayOverlay() {
  if (!hotspotLayer || liftDisplayOverlay) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "lift-panel-overlay";

  const main = document.createElement("div");
  main.className = "lift-panel-main";

  const sub = document.createElement("div");
  sub.className = "lift-panel-sub";

  wrapper.appendChild(main);
  wrapper.appendChild(sub);
  hotspotLayer.appendChild(wrapper);
  liftDisplayOverlay = wrapper;
}

function updateLiftDisplayText(primaryLine, secondaryLine = "") {
  if (!liftDisplayContext || !liftDisplayTexture) {
    return;
  }

  const textKey = `${primaryLine}||${secondaryLine}`;
  if (textKey === liftDisplayLastText) {
    return;
  }
  liftDisplayLastText = textKey;

  const ctx = liftDisplayContext;
  const w = liftDisplayCanvas.width;
  const h = liftDisplayCanvas.height;
  ctx.fillStyle = "#060606";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(255, 141, 46, 0.7)";
  ctx.lineWidth = 10;
  ctx.strokeRect(16, 16, w - 32, h - 32);

  ctx.fillStyle = "#ff972f";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 152px Manrope, sans-serif";
  ctx.fillText(primaryLine, w * 0.5, h * 0.45);

  if (secondaryLine) {
    ctx.font = "600 64px Manrope, sans-serif";
    ctx.fillStyle = "#ffc07d";
    ctx.fillText(secondaryLine, w * 0.5, h * 0.76);
  }

  liftDisplayTexture.needsUpdate = true;

  if (liftDisplayOverlay) {
    const main = liftDisplayOverlay.querySelector(".lift-panel-main");
    const sub = liftDisplayOverlay.querySelector(".lift-panel-sub");
    if (main) {
      main.textContent = primaryLine;
    }
    if (sub) {
      sub.textContent = secondaryLine;
    }
  }
}

function configureLiftModelIfNeeded(modelPath) {
  if (!modelRoot || modelPath !== MODEL_PATHS.lift) {
    return;
  }

  modelRoot.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    const nodeName = (node.name || "").trim();
    if (!nodeName) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(LIFT_BUTTON_TO_FLOOR, nodeName)) {
      cloneMeshMaterials(node);
      liftButtonMeshes.set(nodeName, node);
      liftInteractiveButtons.push({ mesh: node, floor: LIFT_BUTTON_TO_FLOOR[nodeName] });
      addLiftButtonLabel(node, LIFT_BUTTON_TO_FLOOR[nodeName]);
      createLiftButtonOverlay(nodeName, LIFT_BUTTON_TO_FLOOR[nodeName], node);
      return;
    }

    if (Object.prototype.hasOwnProperty.call(LIFT_BUTTON_SYMBOL, nodeName)) {
      cloneMeshMaterials(node);
      liftButtonMeshes.set(nodeName, node);
      addLiftButtonLabel(node, LIFT_BUTTON_SYMBOL[nodeName]);
      createLiftButtonOverlay(nodeName, LIFT_BUTTON_SYMBOL[nodeName], node);
      return;
    }

    if (nodeName === "Cube.002") {
      cloneMeshMaterials(node);
      ensureLiftDisplayPanel(node);
    }
  });

  updateLiftButtonVisuals();
  updateLiftDisplayText(`FLOOR ${liftCurrentFloor}`, "Select a floor");
  updateUIForInputMode();
}

function tryHandleLiftClick(screenX, screenY) {
  if (activeModelPath !== MODEL_PATHS.lift || !liftInteractiveButtons.length) {
    return false;
  }

  const ndc = new THREE.Vector2();
  if (!isMobileView && controls.isLocked) {
    ndc.set(0, 0);
  } else if (typeof screenX === "number" && typeof screenY === "number") {
    ndc.x = (screenX / window.innerWidth) * 2 - 1;
    ndc.y = -(screenY / window.innerHeight) * 2 + 1;
  } else {
    ndc.set(0, 0);
  }

  // Collision checks reuse the same raycaster and shorten its range; reset it for UI interactions.
  raycaster.near = 0;
  raycaster.far = Infinity;
  raycaster.setFromCamera(ndc, camera);
  const targets = liftInteractiveButtons.map((entry) => entry.mesh);
  const hits = raycaster.intersectObjects(targets, false);
  if (!hits.length) {
    const screenTargetX = ndc.x === 0 ? window.innerWidth * 0.5 : ((ndc.x + 1) * 0.5) * window.innerWidth;
    const screenTargetY = ndc.y === 0 ? window.innerHeight * 0.5 : ((1 - ndc.y) * 0.5) * window.innerHeight;
    const maxDistPx = controls.isLocked ? 180 : 90;
    const nearest = findNearestLiftFloorButton(screenTargetX, screenTargetY, maxDistPx);
    if (!nearest) {
      return false;
    }

    queueLiftFloor(nearest.floor);
    return true;
  }

  const firstMesh = hits[0].object;
  const entry = liftInteractiveButtons.find((item) => item.mesh === firstMesh);
  if (!entry) {
    return false;
  }

  queueLiftFloor(entry.floor);
  return true;
}

function findNearestLiftFloorButton(screenX, screenY, maxDistancePx) {
  let nearest = null;
  let nearestDistSq = maxDistancePx * maxDistancePx;

  liftInteractiveButtons.forEach((entry) => {
    entry.mesh.getWorldPosition(liftOverlayScratch);
    const projected = liftOverlayScratch.clone().project(camera);
    const visible = projected.z < 1 && projected.z > -1;
    if (!visible) {
      return;
    }

    const px = (projected.x * 0.5 + 0.5) * window.innerWidth;
    const py = (projected.y * -0.5 + 0.5) * window.innerHeight;
    const dx = px - screenX;
    const dy = py - screenY;
    const distSq = dx * dx + dy * dy;
    if (distSq > nearestDistSq) {
      return;
    }

    nearestDistSq = distSq;
    nearest = entry;
  });

  return nearest;
}

function buildLiftTravelRoute(fromFloor, toFloor) {
  const fromIdx = FLOOR_TO_INDEX.get(fromFloor);
  const toIdx = FLOOR_TO_INDEX.get(toFloor);
  if (fromIdx === undefined || toIdx === undefined) {
    return [fromFloor, toFloor];
  }

  const step = fromIdx <= toIdx ? 1 : -1;
  const route = [FLOOR_ORDER[fromIdx]];
  for (let idx = fromIdx + step; step > 0 ? idx <= toIdx : idx >= toIdx; idx += step) {
    route.push(FLOOR_ORDER[idx]);
  }
  return route;
}

function queueLiftFloor(floor) {
  if (activeModelPath !== MODEL_PATHS.lift || !FLOOR_TO_INDEX.has(floor)) {
    return;
  }

  if (liftIsMoving) {
    return;
  }

  if (liftCurrentFloor === floor) {
    liftTargetFloor = null;
    updateLiftDisplayText(`FLOOR ${liftCurrentFloor}`, "Already here");
    updateLiftButtonVisuals();
    updateExitLiftButton();
    return;
  }

  liftTargetFloor = floor;
  liftTravelRoute = buildLiftTravelRoute(liftCurrentFloor, floor);
  liftTravelStart = performance.now();
  liftTravelDuration = Math.max(1000, (liftTravelRoute.length - 1) * 1300);
  liftIsMoving = true;

  const fromFloor = liftTravelRoute[0];
  const nextFloor = liftTravelRoute[1] ?? floor;
  updateLiftDisplayText(`MOVING ${fromFloor}>${nextFloor}`, `Target ${floor}`);
  updateLiftButtonVisuals();
  updateExitLiftButton();
}

function updateLiftTravel(now) {
  if (!liftIsMoving || activeModelPath !== MODEL_PATHS.lift) {
    return;
  }

  if (!liftTargetFloor || liftTravelRoute.length < 2) {
    liftIsMoving = false;
    updateExitLiftButton();
    return;
  }

  const elapsed = now - liftTravelStart;
  const progress = THREE.MathUtils.clamp(elapsed / liftTravelDuration, 0, 1);
  const segmentCount = liftTravelRoute.length - 1;
  const routeProgress = progress * segmentCount;
  const segIndex = Math.min(segmentCount - 1, Math.floor(routeProgress));
  const fromFloor = liftTravelRoute[segIndex];
  const toFloor = liftTravelRoute[Math.min(segIndex + 1, segmentCount)];

  updateLiftDisplayText(`MOVING ${fromFloor}>${toFloor}`, `Target ${liftTargetFloor}`);

  if (progress >= 1) {
    liftCurrentFloor = liftTargetFloor;
    liftTargetFloor = null;
    liftIsMoving = false;
    updateLiftDisplayText(`FLOOR ${liftCurrentFloor}`, "Press Exit Lift");
    updateLiftButtonVisuals();
    updateExitLiftButton();
  }
}

function positionOverlayElement(worldPos, overlayEl, extraYOffset = 0) {
  if (!overlayEl) {
    return;
  }

  const projected = worldPos.clone().project(camera);
  const visible = projected.z < 1 && projected.z > -1;
  if (!visible) {
    overlayEl.classList.remove("visible");
    return;
  }

  const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
  const y = (projected.y * -0.5 + 0.5) * window.innerHeight + extraYOffset;
  overlayEl.style.left = `${x}px`;
  overlayEl.style.top = `${y}px`;
  overlayEl.classList.toggle("visible", hasStarted && activeModelPath === MODEL_PATHS.lift);
}

function updateLiftOverlays() {
  if (activeModelPath !== MODEL_PATHS.lift) {
    liftButtonOverlayMap.forEach((overlayEl) => overlayEl.classList.remove("visible"));
    if (liftDisplayOverlay) {
      liftDisplayOverlay.classList.remove("visible");
    }
    return;
  }

  liftButtonOverlayMap.forEach((overlayEl, meshName) => {
    const mesh = liftButtonMeshes.get(meshName);
    if (!mesh) {
      overlayEl.classList.remove("visible");
      return;
    }

    mesh.getWorldPosition(liftOverlayScratch);
    positionOverlayElement(liftOverlayScratch, overlayEl);
  });

  if (liftDisplayMesh && liftDisplayOverlay) {
    liftDisplayMesh.getWorldPosition(liftOverlayScratch);
    positionOverlayElement(liftOverlayScratch, liftDisplayOverlay, -16);
  }
}

function updateExitLiftButton() {
  if (!exitLiftBtn) {
    return;
  }

  const inLift = activeModelPath === MODEL_PATHS.lift;
  if (!inLift) {
    exitLiftBtn.hidden = true;
    exitLiftBtn.disabled = true;
    exitLiftBtn.textContent = "Exit Lift";
    return;
  }

  exitLiftBtn.hidden = false;
  if (liftIsMoving) {
    exitLiftBtn.disabled = true;
    exitLiftBtn.textContent = `Moving to ${liftTargetFloor ?? "..."}`;
    return;
  }

  exitLiftBtn.disabled = false;
  exitLiftBtn.textContent = `Exit Lift at ${liftCurrentFloor}`;
}

function positionAtMainBlockFloor(floor) {
  if (!modelRoot || activeModelPath !== MODEL_PATHS.mainBlock) {
    return;
  }

  const floorIndex = FLOOR_TO_INDEX.get(floor) ?? 0;
  const bounds = new THREE.Box3().setFromObject(modelRoot);
  const size = bounds.getSize(new THREE.Vector3());

  const liftAnchor = hotspotData[0].position.clone();
  const baseStep = size.y / 10;
  const estimatedStep = THREE.MathUtils.clamp(baseStep * FLOOR_VERTICAL_STEP_SCALE, 6.2, 13.8);
  const floorYOffset = LIFT_EXIT_FLOOR_Y_ADJUST[floor] ?? 0;
  const eyeY =
    floor === "G"
      ? THREE.MathUtils.clamp(mainBlockDefaultEyeY, bounds.min.y + 1.6, bounds.max.y - 1.2)
      : THREE.MathUtils.clamp(
          liftAnchor.y + floorIndex * estimatedStep + floorYOffset,
          bounds.min.y + 1.6,
          bounds.max.y - 1.2
        );

  const viewPreset = LIFT_EXIT_VIEW_OFFSETS[floor] ?? LIFT_EXIT_VIEW_OFFSETS.G;
  const exitPos = new THREE.Vector3(liftAnchor.x, eyeY, liftAnchor.z).add(viewPreset.offset);

  // Keep the Lift hotspot aligned to the current floor so re-entry remains intuitive.
  hotspotData[0].position.set(liftAnchor.x, eyeY - 0.28, liftAnchor.z);
  mainBlockActiveFloor = floor;

  controls.getObject().position.copy(exitPos);
  cameraFloorY = eyeY;
  velocity.set(0, 0, 0);

  const lookTarget = new THREE.Vector3(liftAnchor.x, eyeY, liftAnchor.z).add(viewPreset.lookOffset);
  camera.lookAt(lookTarget);
  if (isMobileView) {
    syncMobileLookFromCamera();
  }
}

function exitLiftAtCurrentFloor() {
  if (activeModelPath !== MODEL_PATHS.lift || liftIsMoving) {
    return;
  }

  const destinationFloor = liftCurrentFloor;
  guidedMode = false;
  guideBtn.textContent = "Guided Path";
  loadingScreen.classList.add("visible");
  progressText.textContent = `Exiting lift to floor ${destinationFloor}...`;

  loadModel(MODEL_PATHS.mainBlock, () => {
    positionAtMainBlockFloor(destinationFloor);
    progressText.textContent = "100%";
  });
}

function onResize() {
  const wasMobile = isMobileView;
  isMobileView = isMobileViewport();

  if (isMobileView && !wasMobile) {
    if (controls.isLocked) {
      controls.unlock();
    }
    syncMobileLookFromCamera();
  }

  updateUIForInputMode();
  updateRendererForViewport();

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function moveCamera(delta) {
  const canMove = guidedMode === false && ((isMobileView && hasStarted) || (!isMobileView && controls.isLocked));
  if (!canMove) {
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

  if (Math.abs(mobileMovement.forward) > 0.01) {
    targetVelocity.addScaledVector(forwardDir, mobileMovement.forward);
  }
  if (Math.abs(mobileMovement.right) > 0.01) {
    targetVelocity.addScaledVector(sideDir, mobileMovement.right);
  }

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
    item.mesh.visible = false;

    const projected = item.position.clone().project(camera);
    const isVisible = projected.z < 1 && projected.z > -1;
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (projected.y * -0.5 + 0.5) * height;

    item.button.style.left = `${x}px`;
    item.button.style.top = `${y}px`;
    item.button.classList.toggle("visible", isVisible && hasStarted);
  });
}

function setActiveCard(topic) {
  stopWelcomeAutoFade();
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
    // Apply fixed spawn position and orientation every time entering the lift
    controls.getObject().position.copy(LIFT_SPAWN_POSITION);
    camera.lookAt(LIFT_SPAWN_LOOK_TARGET);
    cameraFloorY = LIFT_SPAWN_POSITION.y;
    velocity.set(0, 0, 0);
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
  ui.classList.remove("ui-hidden");
}

function isMobileViewport() {
  const touchCapable = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  return touchCapable && window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
}

function updateRendererForViewport() {
  const portrait = window.innerHeight >= window.innerWidth;
  if (isMobileView) {
    camera.fov = portrait ? 84 : 78;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, portrait ? 1.35 : 1.6));
  } else {
    camera.fov = 72;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
  camera.updateProjectionMatrix();
}

function updateUIForInputMode() {
  if (controlsHint) {
    const interactionHint = activeModelPath === MODEL_PATHS.lift ? "Interact: Lift buttons" : "Interact: Click hotspots";
    const mobileInteractionHint =
      activeModelPath === MODEL_PATHS.lift ? "Interact: Tap lift buttons" : "Interact: Tap hotspots";
    const hint = isMobileView
      ? ["Move: Left Joystick", "Look: Swipe", "Use panel buttons to teleport", mobileInteractionHint]
      : ["Move: WASD", "Look: Mouse", "Unlock: ESC", interactionHint];
    const rows = controlsHint.querySelectorAll("p");
    rows.forEach((row, idx) => {
      if (hint[idx]) {
        row.textContent = hint[idx];
      }
    });
  }

  if (mobileControls) {
    mobileControls.style.display = isMobileView ? "block" : "none";
  }

  if (!isMobileView) {
    resetMovePad();
  }

  if (prompt) {
    prompt.textContent = isMobileView
      ? "Use joystick to move and swipe to look"
      : "Click to lock pointer and walk through";
  }
}

function showMobileJoystickPopup() {
  if (!mobilePopup || !isMobileView) {
    return;
  }

  if (mobilePopupTimer) {
    clearTimeout(mobilePopupTimer);
  }

  mobilePopup.classList.add("visible");
  mobilePopupTimer = setTimeout(() => {
    mobilePopup.classList.remove("visible");
  }, 4000);
}

function startWelcomeAutoFade() {
  if (!infoPanel) {
    return;
  }

  stopWelcomeAutoFade();
  infoPanel.classList.remove("collapsed");
  infoPanel.classList.add("auto-fade");

  welcomeFadeTimer = setTimeout(() => {
    infoPanel.classList.remove("auto-fade");
    infoPanel.classList.add("collapsed");
  }, 10000);
}

function stopWelcomeAutoFade() {
  if (welcomeFadeTimer) {
    clearTimeout(welcomeFadeTimer);
    welcomeFadeTimer = null;
  }
  if (infoPanel) {
    infoPanel.classList.remove("auto-fade");
  }
}

function syncMobileLookFromCamera() {
  const lookObject = controls.getObject();
  cameraYaw = lookObject === camera ? camera.rotation.y : lookObject.rotation.y;
  cameraPitch = THREE.MathUtils.clamp(camera.rotation.x, -1.25, 1.25);
  camera.rotation.z = 0;
}

function applyMobileLook() {
  cameraPitch = THREE.MathUtils.clamp(cameraPitch, -1.25, 1.25);
  const lookObject = controls.getObject();

  if (lookObject === camera) {
    camera.rotation.set(cameraPitch, cameraYaw, 0, "YXZ");
    return;
  }

  lookObject.rotation.y = cameraYaw;
  camera.rotation.x = cameraPitch;
  camera.rotation.y = 0;
  camera.rotation.z = 0;
}

function onCanvasTouchStart(event) {
  if (!isMobileView || !hasStarted || guidedMode) {
    return;
  }

  if (event.target.closest("#move-pad")) {
    return;
  }

  if (lookTouchId !== null) {
    return;
  }

  const touch = event.changedTouches[0];
  if (!touch) {
    return;
  }

  if (tryHandleLiftClick(touch.clientX, touch.clientY)) {
    resetInactivity();
    event.preventDefault();
    return;
  }

  lookTouchId = touch.identifier;
  lastLookX = touch.clientX;
  lastLookY = touch.clientY;
}

function onCanvasTouchMove(event) {
  if (!isMobileView || lookTouchId === null || guidedMode) {
    return;
  }

  for (const touch of event.changedTouches) {
    if (touch.identifier !== lookTouchId) {
      continue;
    }

    event.preventDefault();
    const dx = touch.clientX - lastLookX;
    const dy = touch.clientY - lastLookY;
    lastLookX = touch.clientX;
    lastLookY = touch.clientY;

    cameraYaw -= dx * 0.003;
    cameraPitch = THREE.MathUtils.clamp(cameraPitch - dy * 0.0022, -1.25, 1.25);
    applyMobileLook();
    resetInactivity();
    break;
  }
}

function onCanvasTouchEnd(event) {
  if (lookTouchId === null) {
    return;
  }

  for (const touch of event.changedTouches) {
    if (touch.identifier === lookTouchId) {
      lookTouchId = null;
      break;
    }
  }
}

function onMovePadTouchStart(event) {
  if (!isMobileView || guidedMode) {
    return;
  }

  if (moveTouchId !== null) {
    return;
  }

  const touch = event.changedTouches[0];
  if (!touch) {
    return;
  }

  event.preventDefault();
  moveTouchId = touch.identifier;
  updateMoveFromTouch(touch);
  resetInactivity();
}

function onMovePadTouchMove(event) {
  if (!isMobileView || moveTouchId === null || guidedMode) {
    return;
  }

  for (const touch of event.changedTouches) {
    if (touch.identifier !== moveTouchId) {
      continue;
    }

    event.preventDefault();
    updateMoveFromTouch(touch);
    resetInactivity();
    break;
  }
}

function onMovePadTouchEnd(event) {
  if (moveTouchId === null) {
    return;
  }

  for (const touch of event.changedTouches) {
    if (touch.identifier === moveTouchId) {
      moveTouchId = null;
      resetMovePad();
      break;
    }
  }
}

function updateMoveFromTouch(touch) {
  if (!movePad) {
    return;
  }

  const rect = movePad.getBoundingClientRect();
  const centerX = rect.left + rect.width * 0.5;
  const centerY = rect.top + rect.height * 0.5;
  const dx = touch.clientX - centerX;
  const dy = touch.clientY - centerY;
  const maxRadius = rect.width * 0.36;
  const distance = Math.hypot(dx, dy);
  const clamped = distance > maxRadius && distance > 0 ? maxRadius / distance : 1;
  const x = dx * clamped;
  const y = dy * clamped;

  mobileMovement.right = THREE.MathUtils.clamp(x / maxRadius, -1, 1);
  mobileMovement.forward = THREE.MathUtils.clamp(-y / maxRadius, -1, 1);

  if (moveThumb) {
    moveThumb.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }
}

function resetMovePad() {
  mobileMovement.forward = 0;
  mobileMovement.right = 0;
  if (moveThumb) {
    moveThumb.style.transform = "translate(-50%, -50%)";
  }
}

function animate() {
  const delta = Math.min(0.05, clock.getDelta());
  const now = performance.now();

  moveCamera(delta);
  updateGuidedPath(delta);
  updateLiftTravel(now);
  updateHotspots();
  updateLiftOverlays();
  updateImmersiveUI(now);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
