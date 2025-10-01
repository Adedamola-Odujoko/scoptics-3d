// src/TelestratorManager.js (FINAL VERSION WITH UNDO/ERASE)

import {
  Raycaster,
  Vector2,
  Line,
  BufferGeometry,
  LineBasicMaterial,
  Vector3,
  Group,
} from "three";

const Y_OFFSET = 0.02;

export class TelestratorManager {
  constructor(scene, camera, groundPlane, { onDrawStart }) {
    this.scene = scene;
    this.camera = camera;
    this.groundPlane = groundPlane;
    this.onDrawStart = onDrawStart;

    this.raycaster = new Raycaster();
    this.mouse = new Vector2();

    this.currentTool = "cursor";
    this.currentColor = "#ffff00";
    this.isDrawing = false;

    this.currentDrawing = null;
    this.annotations = new Group();
    this.scene.add(this.annotations);
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
    if (event.button !== 0) return; // Only handle left-clicks

    // --- NEW: ERASE LOGIC ---
    if (this.currentTool === "erase") {
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      // Raycast against the annotations, not the ground plane
      const intersects = this.raycaster.intersectObjects(
        this.annotations.children
      );

      if (intersects.length > 0) {
        const objectToErase = intersects[0].object;
        objectToErase.geometry.dispose();
        objectToErase.material.dispose();
        this.annotations.remove(objectToErase);
      }
      return; // Stop here after erasing
    }

    if (this.currentTool === "cursor") return;

    const startPoint = this.getIntersectionPoint(event);
    if (!startPoint) return;

    if (this.onDrawStart) this.onDrawStart();

    this.isDrawing = true;
    const material = new LineBasicMaterial({
      color: this.currentColor,
      linewidth: 3,
      transparent: true,
      opacity: 0.9,
    });

    if (this.currentTool === "line") {
      const geometry = new BufferGeometry().setFromPoints([
        startPoint.clone(),
        startPoint.clone(),
      ]);
      this.currentDrawing = new Line(geometry, material);
    } else if (this.currentTool === "freehand") {
      const points = [startPoint];
      const geometry = new BufferGeometry().setFromPoints(points);
      this.currentDrawing = new Line(geometry, material);
      this.currentDrawing.userData.points = points;
    }

    if (this.currentDrawing) this.annotations.add(this.currentDrawing);
  }

  handleMouseMove(event) {
    if (!this.isDrawing || !this.currentDrawing) return;

    const movePoint = this.getIntersectionPoint(event);
    if (!movePoint) return;

    if (this.currentTool === "line") {
      this.currentDrawing.geometry.attributes.position.setXYZ(
        1,
        movePoint.x,
        movePoint.y,
        movePoint.z
      );
      this.currentDrawing.geometry.attributes.position.needsUpdate = true;
    } else if (this.currentTool === "freehand") {
      this.currentDrawing.userData.points.push(movePoint);
      this.currentDrawing.geometry.dispose();
      this.currentDrawing.geometry = new BufferGeometry().setFromPoints(
        this.currentDrawing.userData.points
      );
    }
  }

  handleMouseUp() {
    this.isDrawing = false;
    this.currentDrawing = null;
  }

  // --- NEW: UNDO LOGIC ---
  undoLast() {
    const children = this.annotations.children;
    if (children.length > 0) {
      const lastDrawing = children[children.length - 1]; // Get the last one
      lastDrawing.geometry.dispose();
      lastDrawing.material.dispose();
      this.annotations.remove(lastDrawing);
    }
  }

  clearAll() {
    this.annotations.children.forEach((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    this.annotations.clear();
  }
}
