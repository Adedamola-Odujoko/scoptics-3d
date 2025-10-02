import {
  Raycaster,
  Vector2,
  Line,
  BufferGeometry,
  LineBasicMaterial,
  Vector3,
  Group,
  Mesh,
  ConeGeometry,
  TorusGeometry,
  MeshBasicMaterial,
  ArcCurve,
} from "three";

const Y_OFFSET = 0.02;

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
  }

  setTool(tool) {
    this.currentTool = tool;
  }
  setColor(color) {
    this.currentColor = color;
  }

  getIntersectionPoint(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(this.groundPlane);

    if (intersects.length > 0) {
      const point = intersects[0].point;
      point.y += Y_OFFSET;
      return point;
    }
    return null;
  }

  handleMouseDown(event) {
    if (event.button !== 0) return;

    if (this.currentTool === "erase") {
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(
        this.annotations.children,
        true
      );

      if (intersects.length > 0) {
        const objectToErase = intersects[0].object.parent.isGroup
          ? intersects[0].object.parent
          : intersects[0].object;

        if (objectToErase.userData.isHighlight) {
          this.highlights.delete(objectToErase.userData.playerId);
        }

        this.annotations.remove(objectToErase);
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

        if (clickedPlayer && !this.highlights.has(playerId)) {
          if (this.onDrawStart) this.onDrawStart();

          const geometry = new TorusGeometry(0.7, 0.08, 16, 48);
          const material = new MeshBasicMaterial({ color: this.currentColor });
          const highlightMesh = new Mesh(geometry, material);
          highlightMesh.rotation.x = -Math.PI / 2;
          highlightMesh.userData.isHighlight = true;
          highlightMesh.userData.playerId = playerId;

          this.highlights.set(playerId, highlightMesh);
          this.annotations.add(highlightMesh);
        }
      }
      return;
    }

    if (this.currentTool === "cursor") return;

    const startPoint = this.getIntersectionPoint(event);
    if (!startPoint) return;

    if (this.onDrawStart) this.onDrawStart();

    this.isDrawing = true;
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

      // --- START: FIX FOR FREEHAND DRAWING ---

      // 1. Add the new point to our array
      line.userData.points.push(movePoint);

      // 2. Dispose of the old geometry to prevent memory leaks
      line.geometry.dispose();

      // 3. Create a brand new geometry from the updated points array
      line.geometry = new BufferGeometry().setFromPoints(line.userData.points);

      // --- END: FIX FOR FREEHAND DRAWING ---
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
        this.highlights.delete(lastDrawing.userData.playerId);
      }
      this.annotations.remove(lastDrawing);
    }
  }

  clearAll() {
    this.annotations.clear();
    this.highlights.clear();
  }

  update() {
    if (this.highlights.size === 0) return;

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
  }
}
