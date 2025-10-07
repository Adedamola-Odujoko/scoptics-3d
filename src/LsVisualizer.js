// FILE: src/LsVisualizer.js

import { Group, Color } from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

const Y_OFFSET = 0.1;

export class LsVisualizer {
  constructor(scene) {
    this.scene = scene;
    this.group = new Group();
    this.group.visible = false;
    this.scene.add(this.group);

    const lsLabelDiv = document.createElement("div");
    lsLabelDiv.className = "ls-label";
    lsLabelDiv.style.color = "white";
    lsLabelDiv.style.fontSize = "16px";
    lsLabelDiv.style.fontWeight = "bold";
    lsLabelDiv.style.padding = "3px 6px";
    lsLabelDiv.style.backgroundColor = "rgba(0,0,0,0.6)";
    lsLabelDiv.style.borderRadius = "4px";
    lsLabelDiv.style.textShadow = "1px 1px 3px rgba(0,0,0,1)";
    this.lsLabel = new CSS2DObject(lsLabelDiv);
    this.group.add(this.lsLabel);

    this.highLsColor = new Color(0x00ff00); // Green
    this.midLsColor = new Color(0xffa500); // Orange
    this.lowLsColor = new Color(0xff4136); // Red
    this.activeZone = null;
  }

  update(zone, lsValue) {
    if (!zone || lsValue === null) {
      this.setVisible(false);
      return;
    }
    this.setVisible(true);
    this.activeZone = zone;

    // Update Label
    this.lsLabel.element.textContent = `LS: ${lsValue.toFixed(2)}`;
    // Position label at the center of the zone
    this.lsLabel.position.set(zone.position.x, Y_OFFSET, zone.position.z);

    // Update Zone Color based on LS value
    let color = new Color();
    if (lsValue > 0.5) {
      color.lerpColors(
        this.midLsColor,
        this.highLsColor,
        (lsValue - 0.5) / 0.5
      );
    } else {
      color.lerpColors(this.lowLsColor, this.midLsColor, lsValue / 0.5);
    }
    zone.material.color.set(color);
  }

  setVisible(visible) {
    this.group.visible = visible;
    // When hiding, revert the color of the active zone back to its default red
    if (!visible && this.activeZone) {
      this.activeZone.material.color.set(0xff4136);
      this.activeZone = null;
    }
  }

  destroy() {
    this.group.clear();
    this.scene.remove(this.group);
  }
}
