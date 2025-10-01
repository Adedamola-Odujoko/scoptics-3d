// src/Player.js (FINAL CORRECTED HEIGHT VERSION)

import {
  Vector3,
  SphereGeometry,
  MeshStandardMaterial,
  Mesh,
  Color,
} from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export class Player {
  constructor(scene, playerData, initialColor, playerManager) {
    this.playerData = playerData;
    this.playerManager = playerManager;

    const playerMaterial = new MeshStandardMaterial({
      color: initialColor,
      metalness: 0.2,
      roughness: 0.6,
    });

    if (this.playerData.name === "Ball") {
      const ballRadius = 0.15;
      const ballGeometry = new SphereGeometry(ballRadius, 16, 16);
      this.mesh = new Mesh(ballGeometry, playerMaterial);
      this.mesh.position.y = ballRadius;
    } else {
      const height = 1.8;
      const width = 0.4;
      const roundingRadius = 0.2;
      const playerGeometry = new RoundedBoxGeometry(
        width,
        height,
        width,
        4,
        roundingRadius
      );
      this.mesh = new Mesh(playerGeometry, playerMaterial);
      this.mesh.position.y = height / 2;

      const labelDiv = document.createElement("div");
      labelDiv.className = "player-label";
      labelDiv.textContent = this.playerData.name;
      labelDiv.style.fontSize = "9px";
      labelDiv.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
      labelDiv.style.color = "white";
      labelDiv.style.padding = "1px 4px";
      labelDiv.style.borderRadius = "3px";
      labelDiv.style.fontFamily = "sans-serif";
      labelDiv.style.pointerEvents = "none";

      this.label = new CSS2DObject(labelDiv);
      this.label.position.set(0, height / 2 + 0.3, 0);
      this.mesh.add(this.label);
    }

    this.mesh.userData.player = this;
    scene.add(this.mesh);
    this.targetRoot = new Vector3();
    // Initialize targetRoot with the correct starting position to be safe
    this.targetRoot.copy(this.mesh.position);
    this.currentColor = initialColor;
  }

  updateTarget(targetPosition, newColor) {
    // --- THIS IS THE CRITICAL FIX ---
    // We completely ignore the Y value from the manager (`targetPosition.y` which is 0).
    // Instead of reading the potentially inaccurate `this.mesh.position.y`,
    // we set the target's Y to be the SAME as our initial, correct Y position.
    // This breaks the sinking feedback loop.
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

    if (this.playerData.name !== "Ball" && this.playerManager.ball) {
      const ballPosition = this.playerManager.ball.mesh.position.clone();
      ballPosition.y = this.mesh.position.y;
      this.mesh.lookAt(ballPosition);
    }
  }

  destroy(scene) {
    if (this.label && this.label.element) {
      this.label.element.remove();
    }
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
