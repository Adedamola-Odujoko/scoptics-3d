import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  AmbientLight,
  DirectionalLight,
  GridHelper,
  Color,
  Raycaster,
  Vector2,
  Vector3,
  PlaneGeometry,
  MeshBasicMaterial,
  Mesh,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { initPitch } from "./pitch.js";
import { PlayerManager } from "./PlayerManager.js";
import { MatchDataLoader } from "./MatchDataLoader.js";
import { teamColors } from "./skeleton.js";
import { PlaybackBuffer } from "./PlaybackBuffer.js";
import { createTelestratorUI } from "./TelestratorUI.js";
import { TelestratorManager } from "./TelestratorManager.js";

function createControlsUI() {
  const ctrl = document.createElement("div");
  ctrl.id = "playback-controls";
  ctrl.style.position = "absolute";
  ctrl.style.bottom = "14px";
  ctrl.style.left = "50%";
  ctrl.style.transform = "translateX(-50%)";
  ctrl.style.display = "flex";
  ctrl.style.alignItems = "center";
  ctrl.style.gap = "8px";
  ctrl.style.padding = "8px 12px";
  ctrl.style.background = "rgba(0,0,0,0.45)";
  ctrl.style.borderRadius = "8px";
  ctrl.style.zIndex = "999";
  ctrl.style.color = "#ddd";
  ctrl.style.fontFamily = "sans-serif";
  ctrl.style.fontSize = "13px";

  const btn = (text, title) => {
    const b = document.createElement("button");
    b.innerText = text;
    b.title = title || text;
    b.style.padding = "6px 10px";
    b.style.border = "none";
    b.style.background = "#222";
    b.style.color = "#ddd";
    b.style.borderRadius = "6px";
    b.style.cursor = "pointer";
    b.style.fontSize = "13px";
    return b;
  };

  const playBtn = btn("Play ▶", "Play / Pause (Space)");
  const liveBtn = btn("End ⤴", "Jump to End (L)");
  const back10 = btn("⟲ 10s", "Rewind 10s (Left)");
  const fwd10 = btn("10s ⟳", "Forward 10s (Right)");

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = 0;
  slider.max = 1000;
  slider.value = 1000;
  slider.style.width = "360px";

  const playbackRateSelect = document.createElement("select");
  playbackRateSelect.title = "Playback rate";
  ["0.5x", "1x", "2x"].forEach((label) => {
    const opt = document.createElement("option");
    opt.value = label.replace("x", "");
    opt.innerText = label;
    playbackRateSelect.appendChild(opt);
  });
  playbackRateSelect.style.padding = "6px";
  playbackRateSelect.style.borderRadius = "6px";
  playbackRateSelect.style.border = "none";
  playbackRateSelect.style.background = "#222";
  playbackRateSelect.style.color = "#ddd";
  playbackRateSelect.value = "1";

  const timeLabel = document.createElement("div");
  timeLabel.innerText = "LOADING...";
  timeLabel.style.minWidth = "64px";
  timeLabel.style.textAlign = "center";

  ctrl.appendChild(back10);
  ctrl.appendChild(playBtn);
  ctrl.appendChild(liveBtn);
  ctrl.appendChild(fwd10);
  ctrl.appendChild(slider);
  ctrl.appendChild(playbackRateSelect);
  ctrl.appendChild(timeLabel);

  document.body.appendChild(ctrl);

  return {
    container: ctrl,
    playBtn,
    liveBtn,
    back10,
    fwd10,
    slider,
    playbackRateSelect,
    timeLabel,
  };
}

function formatTimeMsDiff(msDiff) {
  const total = Math.max(0, Math.floor(msDiff / 1000));
  const mm = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(total % 60)
    .toString()
    .padStart(2, "0");
  return `${mm}:${ss}`;
}

function createTimestampLocatorUI() {
  const locator = document.createElement("div");
  locator.id = "timestamp-locator";
  locator.style.position = "absolute";
  locator.style.top = "14px";
  locator.style.left = "14px";
  locator.style.display = "flex";
  locator.style.alignItems = "center";
  locator.style.gap = "6px";
  locator.style.padding = "6px 10px";
  locator.style.background = "rgba(0,0,0,0.45)";
  locator.style.borderRadius = "8px";
  locator.style.zIndex = "999";
  locator.style.fontFamily = "sans-serif";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "mm:ss";
  input.style.width = "50px";
  input.style.padding = "4px";
  input.style.border = "1px solid #444";
  input.style.borderRadius = "4px";
  input.style.background = "#222";
  input.style.color = "#ddd";
  input.style.textAlign = "center";

  const btn = document.createElement("button");
  btn.innerText = "Go";
  btn.style.padding = "4px 10px";
  btn.style.border = "none";
  btn.style.background = "#333";
  btn.style.color = "#ddd";
  btn.style.borderRadius = "4px";
  btn.style.cursor = "pointer";

  locator.appendChild(input);
  locator.appendChild(btn);
  document.body.appendChild(locator);

  return { container: locator, input, button: btn };
}

async function main() {
  const container = document.getElementById("canvas-container");
  const loadingOverlay = document.getElementById("loading-overlay");
  if (loadingOverlay) {
    loadingOverlay.style.display = "flex";
    loadingOverlay.style.opacity = 1;
  }

  const loader = new MatchDataLoader(
    "/match_metadata.json",
    "/structured_data.json"
  );
  const allFrames = await loader.load();
  const metadata = loader.metadata;

  if (!allFrames || allFrames.length === 0 || !metadata) {
    if (loadingOverlay)
      loadingOverlay.innerText = "Error: Could not load match data.";
    console.error("Aborting: Failed to load or process match data.");
    return;
  }

  const scene = new Scene();
  scene.background = new Color(0x0a0a0a);
  const camera = new PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    5000
  );
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);
  camera.position.set(0, 30, 70);
  camera.lookAt(0, 0, 0);

  let labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = "0px";
  labelRenderer.domElement.style.pointerEvents = "none";
  document.body.appendChild(labelRenderer.domElement);

  scene.add(new AmbientLight(0xffffff, 0.8));
  const dirLight = new DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(30, 50, -50);
  scene.add(dirLight);
  const controls = new OrbitControls(camera, renderer.domElement);

  const groundGeometry = new PlaneGeometry(200, 200);
  const groundMaterial = new MeshBasicMaterial({ visible: false });
  const groundPlane = new Mesh(groundGeometry, groundMaterial);
  groundPlane.rotation.x = -Math.PI / 2;
  scene.add(groundPlane);

  initPitch(scene);
  scene.add(new GridHelper(120, 120, 0x444444, 0x222222));

  const homeTeamName = metadata.home_team.name;
  const awayTeamName = metadata.away_team.name;
  const teamColorMap = {
    [homeTeamName]: teamColors.Home,
    [awayTeamName]: teamColors.Away,
    Referee: teamColors.Referee,
    Ball: teamColors.Ball,
  };
  const playerManager = new PlayerManager(scene, teamColorMap);

  const telestratorManager = new TelestratorManager(
    scene,
    camera,
    groundPlane,
    playerManager,
    {
      onDrawStart: () => {
        if (isPlaying) {
          isPlaying = false;
          ui.playBtn.innerText = "Play ▶";
        }
      },
    }
  );

  createTelestratorUI({
    onToolSelect: (tool) => {
      telestratorManager.setTool(tool);
      controls.enabled = tool === "cursor";
    },
    onColorSelect: (color) => telestratorManager.setColor(color),
    onClear: () => telestratorManager.clearAll(),
    onUndo: () => telestratorManager.undoLast(),
    onConnectToggle: (enabled) => {
      telestratorManager.setConnectMode(enabled);
    },
  });

  const buffer = new PlaybackBuffer();
  allFrames.forEach((frame) => {
    buffer.push(frame.players, { videoTime: frame.frame_time_ms });
  });

  let isPlaying = false;
  let isLive = false;
  let playbackClock = buffer.first()?.videoTime || 0;
  let lastTick = performance.now();
  let playbackRate = 1.0;
  let sliderSeeking = false;
  const tenSecondsMs = 10000;

  const ui = createControlsUI();
  const locatorUI = createTimestampLocatorUI();
  ui.playBtn.innerText = "Play ▶";
  ui.slider.value = 0;
  ui.timeLabel.innerText = formatTimeMsDiff(0);

  let cameraMode = "orbit";
  let followedPlayerID = null;
  const raycaster = new Raycaster();
  const mouse = new Vector2();
  const thirdPersonOffset = new Vector3(0, 4, -8);

  const handleGoToTimestamp = () => {
    const timeStr = locatorUI.input.value;
    if (!timeStr || !timeStr.includes(":")) return;
    const parts = timeStr.split(":");
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    if (isNaN(minutes) || isNaN(seconds)) return;
    const targetMs = (minutes * 60 + seconds) * 1000;
    const span = buffer.timeSpan();
    playbackClock = Math.max(span.start, Math.min(span.end, targetMs));
    isPlaying = false;
    ui.playBtn.innerText = "Play ▶";
  };

  locatorUI.button.addEventListener("click", handleGoToTimestamp);
  locatorUI.input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") handleGoToTimestamp();
  });

  ui.playbackRateSelect.addEventListener("change", () => {
    const v = Number(ui.playbackRateSelect.value);
    if (!isNaN(v) && v > 0) playbackRate = v;
  });

  ui.playBtn.onclick = () => {
    isPlaying = !isPlaying;
    if (isPlaying) {
      if (playbackClock >= buffer.last().videoTime) {
        playbackClock = buffer.first().videoTime;
      }
      lastTick = performance.now();
    }
    ui.playBtn.innerText = isPlaying ? "Pause ⏸" : "Play ▶";
  };

  ui.liveBtn.onclick = () => {
    const last = buffer.last();
    if (last) {
      playbackClock = last.videoTime;
      isLive = true;
      isPlaying = false;
      ui.playBtn.innerText = "Play ▶";
    }
  };

  ui.back10.onclick = () => {
    isLive = false;
    playbackClock = Math.max(
      buffer.first().videoTime,
      playbackClock - tenSecondsMs
    );
  };

  ui.fwd10.onclick = () => {
    const last = buffer.last();
    if (!last) return;
    playbackClock = Math.min(last.videoTime, playbackClock + tenSecondsMs);
    if (playbackClock >= last.videoTime) isLive = true;
  };

  ui.slider.addEventListener("input", () => {
    sliderSeeking = true;
    isLive = false;
    const frac = Number(ui.slider.value) / Number(ui.slider.max);
    const f = buffer.frameForFraction(frac);
    if (f) playbackClock = f.videoTime;
  });
  ui.slider.addEventListener("change", () => {
    sliderSeeking = false;
  });

  function onPlayerClick(event) {
    if (controls.enabled === false && cameraMode !== "orbit") return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const playerMeshes = playerManager.getPlayerMeshes();
    const intersects = raycaster.intersectObjects(playerMeshes);
    if (intersects.length > 0) {
      const clickedPlayer = intersects[0].object.userData.player;
      if (clickedPlayer && clickedPlayer.playerData) {
        followedPlayerID = clickedPlayer.playerData.id;
        cameraMode = "thirdPerson";
      }
    }
  }

  window.addEventListener("dblclick", onPlayerClick);
  window.addEventListener("mousedown", (event) =>
    telestratorManager.handleMouseDown(event)
  );
  window.addEventListener("mousemove", (event) =>
    telestratorManager.handleMouseMove(event)
  );
  window.addEventListener("mouseup", (event) =>
    telestratorManager.handleMouseUp(event)
  );

  window.addEventListener("keydown", (ev) => {
    if (ev.code === "Space") {
      ev.preventDefault();
      ui.playBtn.click();
    } else if (ev.key.toLowerCase() === "l") {
      ui.liveBtn.click();
    } else if (ev.code === "ArrowLeft") {
      ui.back10.click();
    } else if (ev.code === "ArrowRight") {
      ui.fwd10.click();
    } else if (ev.key === "Escape" || ev.key === "3") {
      cameraMode = "orbit";
      followedPlayerID = null;
      controls.enabled = true;
    }
    if (followedPlayerID) {
      if (ev.key === "1") cameraMode = "thirdPerson";
      if (ev.key === "2") cameraMode = "pov";
    }
  });

  if (loadingOverlay) {
    loadingOverlay.style.opacity = 0;
    setTimeout(() => {
      loadingOverlay.style.display = "none";
    }, 500);
  }

  const worldPlayerPos = new Vector3();
  const localPlayerPos = new Vector3();

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = now - lastTick;
    lastTick = now;
    if (isPlaying && dt > 0) {
      playbackClock += dt * playbackRate;
    }
    const span = buffer.timeSpan();
    if (playbackClock >= span.end) {
      playbackClock = span.end;
      isLive = true;
      if (isPlaying) {
        isPlaying = false;
        ui.playBtn.innerText = "Play ▶";
      }
    } else {
      isLive = false;
    }
    const frames = buffer.findFramesForInterpolation(playbackClock);
    if (frames) {
      const { prev, next } = frames;
      let interpAlpha = 0;
      const frameDuration = next.videoTime - prev.videoTime;
      if (frameDuration > 0) {
        interpAlpha = (playbackClock - prev.videoTime) / frameDuration;
      }
      playerManager.updateWithInterpolation(prev, next, interpAlpha);
    }
    playerManager.smoothAll(0.15);
    telestratorManager.update();

    const zones = telestratorManager.getZones();
    const playersToHighlight = new Set();
    if (zones.length > 0) {
      for (const player of playerManager.playerMap.values()) {
        if (!player.mesh || player.playerData.name === "Ball") continue;
        let isInsideAnyZone = false;
        for (const zone of zones) {
          player.mesh.getWorldPosition(worldPlayerPos);
          if (zone.userData.type === "circle") {
            const distance = zone.position.distanceTo(worldPlayerPos);
            if (distance <= zone.scale.x) {
              isInsideAnyZone = true;
              break;
            }
          } else if (zone.userData.type === "box") {
            zone.worldToLocal(localPlayerPos.copy(worldPlayerPos));
            if (
              Math.abs(localPlayerPos.x) <= 0.5 &&
              Math.abs(localPlayerPos.y) <= 0.5
            ) {
              isInsideAnyZone = true;
              break;
            }
          }
        }
        if (isInsideAnyZone) {
          playersToHighlight.add(player.playerData.id);
        }
      }
    }
    for (const player of playerManager.playerMap.values()) {
      if (playersToHighlight.has(player.playerData.id)) {
        if (!player.isHighlighted) player.showHighlight();
      } else {
        if (player.isHighlighted) player.hideHighlight();
      }
    }

    const followedPlayer = followedPlayerID
      ? playerManager.playerMap.get(followedPlayerID)
      : null;
    if (followedPlayer && followedPlayer.mesh) {
      controls.enabled = false;
      if (cameraMode === "thirdPerson") {
        const targetPosition = followedPlayer.mesh.position
          .clone()
          .add(thirdPersonOffset);
        camera.position.lerp(targetPosition, 0.1);
        camera.lookAt(followedPlayer.mesh.position);
      } else if (cameraMode === "pov") {
        camera.position.copy(followedPlayer.mesh.position);
        camera.position.y += 1.6;
        const ball = playerManager.ball;
        if (ball) {
          camera.lookAt(ball.mesh.position);
        }
      }
    } else {
      if (followedPlayerID) {
        followedPlayerID = null;
        cameraMode = "orbit";
      }
      if (controls.enabled) {
        controls.update();
      }
    }

    if (span.end > span.start) {
      const frac = (playbackClock - span.start) / (span.end - span.start);
      if (!sliderSeeking) {
        ui.slider.value = Math.floor(frac * Number(ui.slider.max));
      }
      const timeElapsed = playbackClock - span.start;
      if (isLive) {
        ui.timeLabel.innerText = "END";
      } else {
        ui.timeLabel.innerText = formatTimeMsDiff(timeElapsed);
      }
    }

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
  });

  window.focus();
}

main().catch((e) => console.error("Fatal error in main:", e));
