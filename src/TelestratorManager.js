import {
  Raycaster,
  Vector2,
  Line,
  BufferGeometry,
  LineBasicMaterial,
  LineDashedMaterial,
  Vector3,
  Group,
  Mesh,
  ConeGeometry,
  TorusGeometry,
  MeshBasicMaterial,
  ArcCurve,
  PlaneGeometry,
  CircleGeometry,
  Shape,
  ShapeGeometry,
} from "three";
import { XgVisualizer } from "./XgVisualizer.js";
import { calculateXg } from "./XgCalculator.js";

const Y_OFFSET = 0.02;
const INTERCEPTION_RADIUS = 1.5;

function computeConvexHull2D(points) {
  const pts = points
    .map((p) => ({ x: p.x, z: p.z, original: p }))
    .sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (o, a, b) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  return lower
    .slice(0, -1)
    .concat(upper.slice(0, -1))
    .map((p) => p.original);
}

function distanceToLineSegment(p, v, w) {
  const l2 = v.distanceToSquared(w);
  if (l2 === 0) return p.distanceTo(v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.z - v.z) * (w.z - v.z)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projection = new Vector3(
    v.x + t * (w.x - v.x),
    0,
    v.z + t * (w.z - v.z)
  );
  return p.distanceTo(projection);
}

function isPointInTriangle(p, p0, p1, p2) {
  const A =
    (1 / 2) *
    (-p1.y * p2.x + p0.y * (-p1.x + p2.x) + p0.x * (p1.y - p2.y) + p1.x * p2.y);
  const sign = A < 0 ? -1 : 1;
  const s =
    (p0.y * p2.x - p0.x * p2.y + (p2.y - p0.y) * p.x + (p0.x - p2.x) * p.y) *
    sign;
  const t =
    (p0.x * p1.y - p0.y * p1.x + (p0.y - p1.y) * p.x + (p1.x - p0.x) * p.y) *
    sign;
  return s > 0 && t > 0 && s + t < 2 * A * sign;
}

export class TelestratorManager {
  constructor(scene, camera, groundPlane, playerManager, { onDrawStart }) {
    this.scene = scene;
    this.camera = camera;
    this.groundPlane = groundPlane;
    this.playerManager = playerManager;
    this.onDrawStart = onDrawStart;
    this.raycaster = new Raycaster();
    this.mouse = new Vector2();
    this.currentTool = "cursor";
    this.currentColor = "#ffff00";
    this.isDrawing = false;
    this.currentDrawing = null;
    this.annotations = new Group();
    this.scene.add(this.annotations);
    this.highlights = new Map();
    this.highlightedPlayerIds = new Set();
    this.isConnectMode = false;
    this.isTrackMode = false;
    this.connectionShape = null;
    this.passingLaneState = "idle";
    this.passer = null;
    this.activeLanes = [];
    this.passingLanesGroup = new Group();
    this.scene.add(this.passingLanesGroup);
    this.isXgMode = false;
    this.xgVisualizer = new XgVisualizer(scene);
    this.previousPressuringDefenders = new Set();
    this.pitchLength = 105;
    this.pitchWidth = 68;
  }

  setTool(tool) {
    this.currentTool = tool;
    this.passer = null;
    this.passingLaneState = "idle";
  }

  setColor(color) {
    this.currentColor = color;
  }

  setConnectMode(enabled) {
    this.isConnectMode = enabled;
    this.updateConnectionShape();
  }

  setTrackMode(enabled) {
    this.isTrackMode = enabled;
    for (const player of this.playerManager.playerMap.values()) {
      if (this.highlightedPlayerIds.has(player.playerData.id) && enabled) {
        player.startTracking(this.scene);
      } else {
        player.stopTracking(this.scene);
      }
    }
  }

  setXgMode(enabled) {
    this.isXgMode = enabled;
    if (!enabled) {
      this.xgVisualizer.setVisible(false);
      this.previousPressuringDefenders.forEach((p) =>
        p.hideInterceptorHighlight()
      );
      this.previousPressuringDefenders.clear();
    }
  }

  getIntersectionPoint(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(this.groundPlane);
    return intersects.length > 0 ? intersects[0].point : null;
  }

  getZones() {
    return this.annotations.children.filter((child) => child.userData.isZone);
  }

  handleMouseDown(event) {
    if (event.button !== 0) return;

    if (this.currentTool === "passing-lane") {
      const playerMeshes = this.playerManager.getPlayerMeshes();
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(playerMeshes);
      if (intersects.length > 0) {
        const clickedPlayer = intersects[0].object.userData.player;
        if (this.passingLaneState === "idle") {
          this.passer = clickedPlayer;
          this.passingLaneState = "awaiting_receiver";
        } else if (this.passingLaneState === "awaiting_receiver") {
          if (clickedPlayer !== this.passer) {
            this.createPassingLane(this.passer, clickedPlayer);
          }
          this.passer = null;
          this.passingLaneState = "idle";
        }
      } else {
        this.passer = null;
        this.passingLaneState = "idle";
      }
      return;
    }

    if (this.currentTool === "erase") {
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(
        [...this.annotations.children, ...this.passingLanesGroup.children],
        true
      );
      if (intersects.length > 0) {
        let objectToErase = intersects[0].object;
        while (
          objectToErase.parent &&
          !objectToErase.userData.isHighlight &&
          !objectToErase.userData.isConnectionShape &&
          objectToErase.parent !== this.annotations &&
          objectToErase.parent !== this.passingLanesGroup
        ) {
          objectToErase = objectToErase.parent;
        }

        if (objectToErase.userData.isHighlight) {
          const playerIdToRemove = [...this.highlights.entries()].find(
            ([id, mesh]) => mesh === objectToErase
          )?.[0];
          if (playerIdToRemove) {
            this.highlights.delete(playerIdToRemove);
            this.highlightedPlayerIds.delete(playerIdToRemove);
            this.updateConnectionShape();
            const player = this.playerManager.playerMap.get(playerIdToRemove);
            if (player) player.stopTracking(this.scene);
          }
        }
        this.annotations.remove(objectToErase);
        this.passingLanesGroup.remove(objectToErase);
      }
      return;
    }

    if (this.currentTool === "highlight") {
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const playerMeshes = this.playerManager.getPlayerMeshes();
      const intersects = this.raycaster.intersectObjects(playerMeshes);
      if (intersects.length > 0) {
        const clickedPlayer = intersects[0].object.userData.player;
        const playerId = clickedPlayer.playerData.id;
        if (this.highlightedPlayerIds.has(playerId)) {
          this.highlightedPlayerIds.delete(playerId);
          const highlightMesh = this.highlights.get(playerId);
          if (highlightMesh) {
            this.annotations.remove(highlightMesh);
            this.highlights.delete(playerId);
          }
          clickedPlayer.stopTracking(this.scene);
        } else {
          this.highlightedPlayerIds.add(playerId);
          const geometry = new TorusGeometry(0.7, 0.08, 16, 48);
          const material = new MeshBasicMaterial({ color: this.currentColor });
          const highlightMesh = new Mesh(geometry, material);
          highlightMesh.rotation.x = -Math.PI / 2;
          highlightMesh.userData.isHighlight = true;
          this.highlights.set(playerId, highlightMesh);
          this.annotations.add(highlightMesh);
          if (this.isTrackMode) {
            clickedPlayer.startTracking(this.scene);
          }
        }
        this.updateConnectionShape();
      }
      return;
    }

    if (this.currentTool === "cursor") return;
    const startPoint = this.getIntersectionPoint(event);
    if (!startPoint) return;
    if (this.onDrawStart) this.onDrawStart();
    this.isDrawing = true;

    if (this.currentTool.startsWith("zone")) {
      const zoneMaterial = new MeshBasicMaterial({
        color: 0xff4136,
        opacity: 0.4,
        transparent: true,
      });
      if (this.currentTool === "zone-box") {
        const geometry = new PlaneGeometry(1, 1);
        this.currentDrawing = new Mesh(geometry, zoneMaterial);
        this.currentDrawing.rotation.x = -Math.PI / 2;
        this.currentDrawing.position.copy(startPoint);
        this.currentDrawing.userData = {
          isZone: true,
          type: "box",
          startPoint,
        };
      } else if (this.currentTool === "zone-circle") {
        const geometry = new CircleGeometry(1, 48);
        this.currentDrawing = new Mesh(geometry, zoneMaterial);
        this.currentDrawing.rotation.x = -Math.PI / 2;
        this.currentDrawing.position.copy(startPoint);
        this.currentDrawing.scale.set(0.01, 0.01, 0.01);
        this.currentDrawing.userData = {
          isZone: true,
          type: "circle",
          startPoint,
        };
      }
      if (this.currentDrawing) this.annotations.add(this.currentDrawing);
      return;
    }

    this.currentDrawing = new Group();
    this.currentDrawing.userData.startPoint = startPoint;
    const material = new LineBasicMaterial({
      color: this.currentColor,
      linewidth: 3,
    });
    if (this.currentTool === "line" || this.currentTool === "arrow") {
      const geometry = new BufferGeometry().setFromPoints([
        startPoint.clone(),
        startPoint.clone(),
      ]);
      const line = new Line(geometry, material);
      this.currentDrawing.add(line);
      if (this.currentTool === "arrow") {
        const coneGeo = new ConeGeometry(0.3, 0.8, 16);
        const coneMat = new MeshBasicMaterial({ color: this.currentColor });
        const cone = new Mesh(coneGeo, coneMat);
        this.currentDrawing.add(cone);
      }
    } else if (this.currentTool === "circle") {
      const points = new ArcCurve(0, 0, 1, 0, 2 * Math.PI, false).getPoints(64);
      const geometry = new BufferGeometry().setFromPoints(points);
      const circle = new Line(geometry, material);
      circle.position.copy(startPoint);
      circle.rotation.x = -Math.PI / 2;
      this.currentDrawing.add(circle);
    } else if (this.currentTool === "freehand") {
      const points = [startPoint];
      const geometry = new BufferGeometry().setFromPoints(points);
      const line = new Line(geometry, material);
      line.userData.points = points;
      this.currentDrawing.add(line);
    }
    if (this.currentDrawing) this.annotations.add(this.currentDrawing);
  }

  handleMouseMove(event) {
    if (!this.isDrawing || !this.currentDrawing) return;
    const movePoint = this.getIntersectionPoint(event);
    if (!movePoint) return;
    const startPoint = this.currentDrawing.userData.startPoint;
    if (this.currentDrawing.userData.isZone) {
      if (this.currentDrawing.userData.type === "box") {
        const width = Math.abs(movePoint.x - startPoint.x);
        const depth = Math.abs(movePoint.z - startPoint.z);
        this.currentDrawing.scale.set(width, depth, 1);
        this.currentDrawing.position.set(
          (startPoint.x + movePoint.x) / 2,
          Y_OFFSET,
          (startPoint.z + movePoint.z) / 2
        );
      } else if (this.currentDrawing.userData.type === "circle") {
        const radius = startPoint.distanceTo(movePoint);
        this.currentDrawing.scale.set(radius, radius, radius);
      }
      return;
    }
    if (this.currentTool === "line" || this.currentTool === "arrow") {
      const line = this.currentDrawing.children[0];
      line.geometry.attributes.position.setXYZ(
        1,
        movePoint.x,
        movePoint.y,
        movePoint.z
      );
      line.geometry.attributes.position.needsUpdate = true;
      if (this.currentTool === "arrow") {
        const cone = this.currentDrawing.children[1];
        cone.position.copy(movePoint);
        const direction = new Vector3().subVectors(movePoint, startPoint);
        if (direction.length() > 0.01) {
          direction.normalize();
          cone.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction);
        }
      }
    } else if (this.currentTool === "circle") {
      const circle = this.currentDrawing.children[0];
      const radius = startPoint.distanceTo(movePoint);
      circle.scale.set(radius, radius, radius);
    } else if (this.currentTool === "freehand") {
      const line = this.currentDrawing.children[0];
      line.userData.points.push(movePoint);
      line.geometry.dispose();
      line.geometry = new BufferGeometry().setFromPoints(line.userData.points);
    }
  }

  handleMouseUp() {
    this.isDrawing = false;
    this.currentDrawing = null;
  }

  undoLast() {
    const children = this.annotations.children;
    if (children.length > 0) {
      const lastDrawing = children[children.length - 1];
      if (lastDrawing.userData.isHighlight) {
        const playerIdToRemove = [...this.highlights.entries()].find(
          ([id, mesh]) => mesh === lastDrawing
        )?.[0];
        if (playerIdToRemove) {
          this.highlights.delete(playerIdToRemove);
          this.highlightedPlayerIds.delete(playerIdToRemove);
          this.updateConnectionShape();
          const player = this.playerManager.playerMap.get(playerIdToRemove);
          if (player) player.stopTracking(this.scene);
        }
      }
      this.annotations.remove(lastDrawing);
    }
  }

  createPassingLane(passer, receiver) {
    const laneGroup = new Group();
    laneGroup.userData = {
      passerId: passer.playerData.id,
      receiverId: receiver.playerData.id,
      previousInterceptors: new Set(),
    };
    const outerGlowMat = new LineBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.15,
      linewidth: 7,
    });
    const innerGlowMat = new LineBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.25,
      linewidth: 4,
    });
    const coreLineMat = new LineBasicMaterial({
      color: 0xeeffff,
      linewidth: 1.5,
    });
    const points = [
      passer.mesh.position.clone(),
      receiver.mesh.position.clone(),
    ];
    const geometry = new BufferGeometry().setFromPoints(points);
    const outerGlow = new Line(geometry.clone(), outerGlowMat);
    const innerGlow = new Line(geometry.clone(), innerGlowMat);
    const coreLine = new Line(geometry, coreLineMat);
    laneGroup.add(outerGlow, innerGlow, coreLine);
    this.passingLanesGroup.add(laneGroup);
    this.activeLanes.push(laneGroup);
  }

  clearAll() {
    this.annotations.clear();
    this.highlights.clear();
    this.highlightedPlayerIds.clear();
    this.updateConnectionShape();
    for (const player of this.playerManager.playerMap.values()) {
      player.stopTracking(this.scene);
      player.hideInterceptorHighlight();
    }
    this.activeLanes.forEach((lane) => {
      lane.userData.previousInterceptors.forEach((player) =>
        player.hideInterceptorHighlight()
      );
    });
    this.activeLanes = [];
    this.passingLanesGroup.clear();
    this.setXgMode(false);
  }

  clearAllTrackLines() {
    if (!this.isTrackMode) return;
    for (const playerId of this.highlightedPlayerIds) {
      const player = this.playerManager.playerMap.get(playerId);
      if (player) player.clearTrackLine();
    }
  }

  updateConnectionShape() {
    if (this.connectionShape) {
      this.annotations.remove(this.connectionShape);
      this.connectionShape.geometry.dispose();
      if (this.connectionShape.material)
        this.connectionShape.material.dispose();
      this.connectionShape = null;
    }
    if (!this.isConnectMode || this.highlightedPlayerIds.size < 2) return;
    const playerPositions = [];
    for (const playerId of this.highlightedPlayerIds) {
      const player = this.playerManager.playerMap.get(playerId);
      if (player && player.mesh) playerPositions.push(player.mesh.position);
    }
    if (playerPositions.length < 2) return;
    const material = new LineBasicMaterial({ color: 0xff4136, linewidth: 3 });
    let shapePoints = [];
    if (playerPositions.length === 2) {
      shapePoints = playerPositions;
    } else {
      shapePoints = computeConvexHull2D(playerPositions);
      if (shapePoints.length > 0) shapePoints.push(shapePoints[0]);
    }
    if (shapePoints.length > 0) {
      const geometry = new BufferGeometry().setFromPoints(shapePoints);
      this.connectionShape = new Line(geometry, material);
      this.connectionShape.userData.isConnectionShape = true;
      this.connectionShape.position.y = Y_OFFSET + 0.01;
      this.annotations.add(this.connectionShape);
    }
  }

  updatePassingLanes() {
    if (this.activeLanes.length === 0) return;
    for (const lane of this.activeLanes) {
      const passer = this.playerManager.playerMap.get(lane.userData.passerId);
      const receiver = this.playerManager.playerMap.get(
        lane.userData.receiverId
      );
      if (!passer || !receiver) {
        lane.visible = false;
        continue;
      }
      lane.visible = true;
      const passerPos = passer.mesh.position;
      const receiverPos = receiver.mesh.position;
      lane.children.forEach((line) => {
        line.geometry.attributes.position.setXYZ(
          0,
          passerPos.x,
          passerPos.y,
          passerPos.z
        );
        line.geometry.attributes.position.setXYZ(
          1,
          receiverPos.x,
          receiverPos.y,
          receiverPos.z
        );
        line.geometry.attributes.position.needsUpdate = true;
      });
      const currentInterceptors = new Set();
      const passerTeam = passer.playerData.team;
      for (const opponent of this.playerManager.playerMap.values()) {
        if (
          opponent.playerData.team !== passerTeam &&
          opponent.playerData.name !== "Ball"
        ) {
          const dist = distanceToLineSegment(
            opponent.mesh.position,
            passerPos,
            receiverPos
          );
          if (dist < INTERCEPTION_RADIUS) currentInterceptors.add(opponent);
        }
      }
      const { previousInterceptors } = lane.userData;
      for (const player of currentInterceptors) {
        if (!previousInterceptors.has(player))
          player.showInterceptorHighlight();
      }
      for (const player of previousInterceptors) {
        if (!currentInterceptors.has(player)) player.hideInterceptorHighlight();
      }
      lane.userData.previousInterceptors = currentInterceptors;
    }
  }

  updateXgVisualizer() {
    if (!this.isXgMode) {
      return;
    }

    const shooterId = [...this.highlightedPlayerIds].pop();
    const shooterPlayer = this.playerManager.playerMap.get(shooterId);

    if (!shooterPlayer) {
      this.xgVisualizer.setVisible(false);
      this.previousPressuringDefenders.forEach((p) =>
        p.hideInterceptorHighlight()
      );
      this.previousPressuringDefenders.clear();
      return;
    }

    const shooterPos_scene = shooterPlayer.mesh.position;
    const shooterTeam = shooterPlayer.playerData.team;

    const goalX_scene =
      shooterPos_scene.x > 0 ? -this.pitchLength / 2 : this.pitchLength / 2;
    const goalX_calc = -goalX_scene;
    const calcShooterPos = {
      x: -shooterPos_scene.x,
      y: shooterPos_scene.y,
      z: shooterPos_scene.z,
    };

    const allOpponents = [];
    let goalkeeper_calc = null;
    let minDistToGoal = Infinity;

    for (const player of this.playerManager.playerMap.values()) {
      if (
        player.playerData.team !== shooterTeam &&
        player.playerData.name !== "Ball"
      ) {
        allOpponents.push(player);
        const calcPlayerX = -player.mesh.position.x;
        const distToGoal = Math.abs(calcPlayerX - goalX_calc);
        if (distToGoal < minDistToGoal) {
          minDistToGoal = distToGoal;
          goalkeeper_calc = {
            x: -player.mesh.position.x,
            y: player.mesh.position.y,
            z: player.mesh.position.z,
          };
        }
      }
    }
    const calcOpponentPositions = allOpponents.map((p) => ({
      x: -p.mesh.position.x,
      y: p.mesh.position.y,
      z: p.mesh.position.z,
    }));

    const xgValue = calculateXg(
      calcShooterPos,
      calcOpponentPositions,
      goalkeeper_calc,
      this.pitchLength,
      this.pitchWidth
    );

    const GOAL_WIDTH = 7.32;
    const pressuringDefenders = new Set();
    const shooterPos2D_scene = new Vector2(
      shooterPos_scene.x,
      shooterPos_scene.z
    );
    const leftPost2D_scene = new Vector2(goalX_scene, GOAL_WIDTH / 2);
    const rightPost2D_scene = new Vector2(goalX_scene, -GOAL_WIDTH / 2);

    for (const opponent of allOpponents) {
      const defenderPos2D_scene = new Vector2(
        opponent.mesh.position.x,
        opponent.mesh.position.z
      );
      if (
        isPointInTriangle(
          defenderPos2D_scene,
          shooterPos2D_scene,
          leftPost2D_scene,
          rightPost2D_scene
        )
      ) {
        pressuringDefenders.add(opponent);
      }
    }

    pressuringDefenders.forEach((p) => {
      if (!this.previousPressuringDefenders.has(p))
        p.showInterceptorHighlight();
    });
    this.previousPressuringDefenders.forEach((p) => {
      if (!pressuringDefenders.has(p)) p.hideInterceptorHighlight();
    });
    this.previousPressuringDefenders = pressuringDefenders;

    const goalPosts_scene = {
      left: new Vector3(goalX_scene, Y_OFFSET, GOAL_WIDTH / 2),
      right: new Vector3(goalX_scene, Y_OFFSET, -GOAL_WIDTH / 2),
    };

    this.xgVisualizer.update(shooterPos_scene, goalPosts_scene, xgValue);
  }

  update() {
    for (const [playerId, highlightMesh] of this.highlights.entries()) {
      const player = this.playerManager.playerMap.get(playerId);
      if (player && player.mesh) {
        highlightMesh.position.copy(player.mesh.position);
        highlightMesh.position.y = Y_OFFSET;
        highlightMesh.rotation.z += 0.02;
        highlightMesh.visible = true;
      } else {
        highlightMesh.visible = false;
      }
    }
    if (this.connectionShape && this.isConnectMode) {
      const livePositions = [];
      for (const playerId of this.highlightedPlayerIds) {
        const player = this.playerManager.playerMap.get(playerId);
        if (player && player.mesh) livePositions.push(player.mesh.position);
      }
      if (livePositions.length < 2) {
        this.updateConnectionShape();
        return;
      }
      let newShapePoints = [];
      if (livePositions.length === 2) {
        newShapePoints = livePositions;
      } else {
        newShapePoints = computeConvexHull2D(livePositions);
        if (newShapePoints.length > 0) newShapePoints.push(newShapePoints[0]);
      }
      if (newShapePoints.length > 0) {
        this.connectionShape.geometry.dispose();
        this.connectionShape.geometry = new BufferGeometry().setFromPoints(
          newShapePoints
        );
      }
    }
  }
}
