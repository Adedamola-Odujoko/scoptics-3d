import {
  Vector3,
  SphereGeometry,
  MeshStandardMaterial,
  Mesh,
  Color,
  ConeGeometry,
  MeshBasicMaterial,
} from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export class Player {
  constructor(scene, playerData, initialColor, playerManager) {
    this.playerData = playerData;
    this.playerManager = playerManager;
    this.isHighlighted = false; // State for highlighting

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
      // --- START: MODIFICATION ---
      labelDiv.style.fontSize = "8px"; // <-- REDUCED FONT SIZE
      labelDiv.style.textShadow = "1px 1px 2px rgba(0,0,0,0.8)"; // <-- ADDED FOR READABILITY
      // --- END: MODIFICATION ---
      labelDiv.style.color = "white";
      labelDiv.style.padding = "2px 4px";
      labelDiv.style.backgroundColor = "rgba(0,0,0,0.5)";
      labelDiv.style.borderRadius = "3px";

      this.label = new CSS2DObject(labelDiv);
      this.label.position.set(0, height / 2 + 0.3, 0);
      this.mesh.add(this.label);

      // Create the highlight indicator
      const highlightGeo = new ConeGeometry(0.4, 0.8, 16);
      const highlightMat = new MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.8,
      });
      this.highlight = new Mesh(highlightGeo, highlightMat);
      this.highlight.position.y = height + 0.8; // Position it above the player
      this.highlight.visible = false; // Hidden by default
      this.mesh.add(this.highlight);
    }

    this.mesh.userData.player = this;
    scene.add(this.mesh);
    this.targetRoot = new Vector3();
    this.targetRoot.copy(this.mesh.position);
    this.currentColor = initialColor;
    this.velocity = new Vector3();
  }

  // Methods to control the highlight
  showHighlight() {
    if (!this.highlight) return;
    this.isHighlighted = true;
    this.highlight.visible = true;
  }

  hideHighlight() {
    if (!this.highlight) return;
    this.isHighlighted = false;
    this.highlight.visible = false;
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
    this.velocity.copy(this.targetRoot).sub(this.mesh.position);
    this.mesh.position.lerp(this.targetRoot, alpha);

    // Animate the highlight if it's visible
    if (this.isHighlighted) {
      this.highlight.rotation.y += 0.03;
    }

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
    // Dispose highlight geometry/material
    if (this.highlight) {
      this.highlight.geometry.dispose();
      this.highlight.material.dispose();
    }
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
