// src/Player.js (FINAL VISUAL VERSION 3.0)

import {
  Vector3,
  CylinderGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  Mesh,
  Color,
} from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

export class Player {
  /**
   * @param {THREE.Scene} scene The main scene.
   * @param {object} playerData The initial data for the player, must include a `name`.
   * @param {THREE.Color} initialColor The player's team color.
   */
  constructor(scene, playerData, initialColor) {
    const playerMaterial = new MeshStandardMaterial({
      color: initialColor,
      metalness: 0.2,
      roughness: 0.6,
    });

    // --- 1. Create a Sphere for the Ball OR a Cylinder for Players ---
    if (playerData.name === "Ball") {
      // --- BALL LOGIC ---
      const ballRadius = 0.22; // Smaller radius for the ball
      const ballGeometry = new SphereGeometry(ballRadius, 16, 16);
      this.mesh = new Mesh(ballGeometry, playerMaterial);
      // Lift the ball so it sits on the ground plane
      this.mesh.position.y = ballRadius;
    } else {
      // --- PLAYER/REFEREE LOGIC ---
      const height = 1.6; // Taller
      const radius = 0.25; // Slimmer
      const playerGeometry = new CylinderGeometry(radius, radius, height, 16);
      this.mesh = new Mesh(playerGeometry, playerMaterial);
      // Lift the cylinder by half its height to sit on the ground plane
      this.mesh.position.y = height / 2;

      // --- 2. Create the Name Label (Only for players/refs) ---
      const labelDiv = document.createElement("div");
      labelDiv.className = "player-label";
      labelDiv.textContent = playerData.name;
      labelDiv.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
      labelDiv.style.color = "white";
      labelDiv.style.padding = "2px 5px";
      labelDiv.style.borderRadius = "3px";
      labelDiv.style.fontSize = "10px"; // <-- REDUCED FONT SIZE
      labelDiv.style.fontFamily = "sans-serif";
      labelDiv.style.pointerEvents = "none"; // Prevent labels from blocking mouse events

      this.label = new CSS2DObject(labelDiv);
      // Position label above the cylinder
      this.label.position.set(0, height / 2 + 0.3, 0);
      this.mesh.add(this.label);
    }

    // --- 3. Finalize ---
    scene.add(this.mesh);
    this.targetRoot = new Vector3();
    this.currentColor = initialColor;
  }

  updateTarget(targetPosition, newColor) {
    this.targetRoot.set(
      targetPosition.x,
      this.mesh.position.y,
      targetPosition.z
    );

    if (!this.currentColor.equals(newColor)) {
      this.currentColor = newColor;
      this.mesh.material.color.set(newColor);
    }
  }

  smooth(alpha) {
    this.mesh.position.lerp(this.targetRoot, alpha);
  }

  destroy(scene) {
    // Check if the label exists before trying to remove its element
    if (this.label && this.label.element) {
      this.label.element.remove();
    }

    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
