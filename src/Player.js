// src/Player.js (FINAL version with safe velocity for camera)

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
      const ballRadius = 0.22;
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
      // ... (other label styles)
      this.label = new CSS2DObject(labelDiv);
      this.label.position.set(0, height / 2 + 0.3, 0);
      this.mesh.add(this.label);
    }

    this.mesh.userData.player = this;
    scene.add(this.mesh);
    this.targetRoot = new Vector3();
    this.targetRoot.copy(this.mesh.position);
    this.currentColor = initialColor;
    // RE-INTRODUCED: Velocity is needed for the camera's fallback orientation
    this.velocity = new Vector3();
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
    // RE-INTRODUCED: We calculate the visual velocity here, before smoothing.
    // This gives the camera a direction to look when the ball isn't visible.
    this.velocity.copy(this.targetRoot).sub(this.mesh.position);

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
