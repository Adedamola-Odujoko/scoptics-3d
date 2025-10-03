import {
  Group,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
  Vector2,
  Color,
} from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

const Y_OFFSET = 0.03; // Slightly above other drawings to avoid z-fighting

export class XgVisualizer {
  constructor(scene) {
    this.scene = scene;
    this.group = new Group();
    this.group.visible = false;
    this.scene.add(this.group);

    // Main cone for shot angle
    this.shotConeMaterial = new MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.3,
      side: 2,
    });
    this.shotCone = new Mesh(new ShapeGeometry(), this.shotConeMaterial);
    this.shotCone.rotation.x = -Math.PI / 2;
    this.shotCone.position.y = Y_OFFSET;
    this.group.add(this.shotCone);

    // Text label for the xG value
    const xgLabelDiv = document.createElement("div");
    xgLabelDiv.className = "xg-label";
    xgLabelDiv.style.color = "white";
    xgLabelDiv.style.fontSize = "16px";
    xgLabelDiv.style.fontWeight = "bold";
    xgLabelDiv.style.textShadow = "1px 1px 3px rgba(0,0,0,1)";
    this.xgLabel = new CSS2DObject(xgLabelDiv);
    this.group.add(this.xgLabel);
  }

  // --- REWORKED: This method is now much simpler ---
  update(shooter, goalPosts, xgValue) {
    if (!shooter) {
      this.setVisible(false);
      return;
    }
    this.setVisible(true);

    const shooterPos2D = new Vector2(shooter.x, shooter.z);
    const leftPost2D = new Vector2(goalPosts.left.x, goalPosts.left.z);
    const rightPost2D = new Vector2(goalPosts.right.x, goalPosts.right.z);

    // --- Update Main Shot Cone ---
    const shotShape = new Shape([shooterPos2D, leftPost2D, rightPost2D]);
    this.shotCone.geometry.dispose();
    this.shotCone.geometry = new ShapeGeometry(shotShape);

    // --- Update Cone Color based on xG ---
    const highXgColor = new Color(0x00ff00); // Green
    const midXgColor = new Color(0xffa500); // Orange
    const lowXgColor = new Color(0xff0000); // Red

    let color = new Color();
    if (xgValue > 0.3) {
      color.lerpColors(midXgColor, highXgColor, (xgValue - 0.3) / 0.7);
    } else {
      color.lerpColors(lowXgColor, midXgColor, xgValue / 0.3);
    }
    this.shotConeMaterial.color.set(color);

    // --- Update xG Label ---
    this.xgLabel.element.textContent = `xG: ${xgValue.toFixed(3)}`;
    const textPosX = (shooter.x + goalPosts.left.x) / 2;
    const textPosZ = shooter.z / 2;
    this.xgLabel.position.set(textPosX, Y_OFFSET, textPosZ);
  }

  destroy() {
    this.group.clear();
    this.scene.remove(this.group);
  }

  setVisible(visible) {
    this.group.visible = visible;
  }
}
