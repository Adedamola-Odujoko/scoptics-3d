// FILE: src/handController.js (Final Corrected Reset Logic)

import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { Vector2, Vector3 } from "three";

const PINCH_THRESHOLD = 0.06;

// --- THIS IS THE DEFINITIVE FIX ---
// Based on your logs (which showed values around 0.2), we set the
// threshold to a value that will correctly capture the gesture.
const FIST_THRESHOLD = 0.2;

// --- SENSITIVITY TUNING (Unchanged from your code) ---
const PAN_SENSITIVITY = 5.0;
const ZOOM_SENSITIVITY = 1.0;
const ORBIT_SENSITIVITY = 6.5;
const GESTURE_MODE_THRESHOLD = 2.5;

export class HandController {
  constructor(videoElement, controls) {
    this.video = videoElement;
    this.controls = controls;
    this.controls.minPolarAngle = 0.1;
    this.controls.maxPolarAngle = Math.PI - 0.1;
    this.handLandmarker = null;
    this.lastVideoTime = -1;
    this.isPanning = false;
    this.panStart = new Vector2();
    this.isMultiHandGesture = false;
    this.lastPinchDistXY = 0;
    this.lastPinchDistZ = 0;
    this.lastMidPointY = 0;
    this.lastHandDist = 1.0;
    this.panDelta = new Vector3();
    this.orbitDelta = { x: 0, y: 0 };
  }

  async init() {
    console.log("HandController: Initializing...");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `/models/hand_landmarker.task`,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
    });
    console.log("✅ Hand Landmarker initialized.");
    // this.controls.saveState();
    // this.startWebcam();
  }

  //   startWebcam() {
  //     if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  //       navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
  //         //this.video.srcObject = stream;
  //         this.video.addEventListener("loadeddata", () => {
  //           console.log("Webcam started.");
  //           this.predictWebcam();
  //         });
  //       });
  //     }
  //   }

  update(alpha) {
    const camera = this.controls.object;
    let needsUpdate = false;
    if (this.panDelta.lengthSq() > 1e-6) {
      const panOffset = this.panDelta.clone().multiplyScalar(alpha);
      camera.position.add(panOffset);
      this.controls.target.add(panOffset);
      this.panDelta.multiplyScalar(1 - alpha);
      needsUpdate = true;
    }
    if (Math.abs(this.orbitDelta.x) > 1e-6) {
      const phi = this.orbitDelta.x * alpha;
      const offset = new Vector3().subVectors(
        camera.position,
        this.controls.target
      );
      offset.applyAxisAngle(new Vector3(0, 1, 0), phi);
      camera.position.copy(this.controls.target).add(offset);
      this.orbitDelta.x *= 1 - alpha;
      needsUpdate = true;
    }
    if (Math.abs(this.orbitDelta.y) > 1e-6) {
      const theta = this.orbitDelta.y * alpha;
      const offset = new Vector3().subVectors(
        camera.position,
        this.controls.target
      );
      const axis = new Vector3().setFromMatrixColumn(camera.matrix, 0);
      offset.applyAxisAngle(axis, theta);
      camera.position.copy(this.controls.target).add(offset);
      this.orbitDelta.y *= 1 - alpha;
      needsUpdate = true;
    }
    if (needsUpdate) this.controls.update();
  }

  predictWebcam() {
    if (this.video.currentTime !== this.lastVideoTime && this.handLandmarker) {
      const results = this.handLandmarker.detectForVideo(
        this.video,
        Date.now()
      );
      if (results.landmarks && results.landmarks.length > 0) {
        this.processGestures(results.landmarks);
      } else {
        this.isPanning = this.isMultiHandGesture = false;
      }
      this.lastVideoTime = this.video.currentTime;
    }
    window.requestAnimationFrame(() => this.predictWebcam());
  }

  processGestures(landmarks) {
    const hands = landmarks.map((hand) => this.getHandData(hand));
    const hand1 = hands[0];
    const hand2 = hands[1];

    if ((hand1 && hand1.isFist) || (hand2 && hand2.isFist)) {
      console.log("Fist detected! Resetting camera.");
      this.controls.reset();
      this.isPanning = this.isMultiHandGesture = false;
      return;
    }

    if (hand1 && hand2 && hand1.isPinching && hand2.isPinching) {
      const distXY = Math.hypot(
        hand1.pinchPoint.x - hand2.pinchPoint.x,
        hand1.pinchPoint.y - hand2.pinchPoint.y
      );
      const distZ = hand1.pinchPoint.z - hand2.pinchPoint.z;
      const midY = (hand1.pinchPoint.y + hand2.pinchPoint.y) / 2;
      if (!this.isMultiHandGesture) {
        this.isMultiHandGesture = true;
        this.lastPinchDistXY = distXY;
        this.lastPinchDistZ = distZ;
        this.lastMidPointY = midY;
      } else {
        const deltaXY_abs = Math.abs(distXY - this.lastPinchDistXY);
        const deltaZ_abs = Math.abs(distZ - this.lastPinchDistZ);
        const deltaY_abs = Math.abs(midY - this.lastMidPointY);
        if (
          deltaXY_abs > deltaZ_abs * GESTURE_MODE_THRESHOLD &&
          deltaXY_abs > deltaY_abs * GESTURE_MODE_THRESHOLD
        ) {
          const zoomFactor =
            (this.lastPinchDistXY / distXY - 1) * ZOOM_SENSITIVITY + 1;
          const vec = new Vector3().subVectors(
            this.controls.object.position,
            this.controls.target
          );
          vec.multiplyScalar(zoomFactor);
          this.controls.object.position.copy(this.controls.target).add(vec);
        } else {
          if (deltaZ_abs > deltaY_abs) {
            const orbitAngle =
              (distZ - this.lastPinchDistZ) * ORBIT_SENSITIVITY * Math.PI;
            this.orbitDelta.x += orbitAngle;
          } else {
            const deltaY = midY - this.lastMidPointY;
            const orbitAngleY = deltaY * ORBIT_SENSITIVITY * Math.PI;
            this.orbitDelta.y += orbitAngleY;
          }
        }
        this.lastPinchDistXY = distXY;
        this.lastPinchDistZ = distZ;
        this.lastMidPointY = midY;
        this.controls.update();
      }
      this.isPanning = false;
    } else if (hand1 && hand1.isPinching) {
      if (!this.isPanning) {
        this.isPanning = true;
        this.panStart.copy(new Vector2(hand1.pinchPoint.x, hand1.pinchPoint.y));
      } else {
        const panEnd = new Vector2(hand1.pinchPoint.x, hand1.pinchPoint.y);
        const delta = panEnd.clone().sub(this.panStart);
        const panScaleFactor =
          PAN_SENSITIVITY *
          (this.controls.object.position.distanceTo(this.controls.target) /
            this.controls.object.zoom);
        const vX = new Vector3().setFromMatrixColumn(
          this.controls.object.matrix,
          0
        );
        const vY = new Vector3().setFromMatrixColumn(
          this.controls.object.matrix,
          1
        );
        const panOffset = vX
          .multiplyScalar(delta.x * panScaleFactor)
          .add(vY.multiplyScalar(delta.y * panScaleFactor));
        this.panDelta.add(panOffset);
        this.panStart.copy(panEnd);
      }
      this.isMultiHandGesture = false;
    } else {
      this.isPanning = this.isMultiHandGesture = false;
    }
  }

  getHandData(landmarks) {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const wrist = landmarks[0];
    const pinchPoint3D = new Vector3(
      (thumbTip.x + indexTip.x) / 2,
      (thumbTip.y + indexTip.y) / 2,
      (thumbTip.z + indexTip.z) / 2
    );
    const pinchDistXY = Math.hypot(
      thumbTip.x - indexTip.x,
      thumbTip.y - indexTip.y
    );
    const fingertips = [
      landmarks[8],
      landmarks[12],
      landmarks[16],
      landmarks[20],
    ];
    const distances = fingertips.map((tip) =>
      Math.hypot(tip.x - wrist.x, tip.y - wrist.y)
    );
    const isFist = distances.every((dist) => dist < FIST_THRESHOLD);
    return {
      pinchPoint: pinchPoint3D,
      isPinching: pinchDistXY < PINCH_THRESHOLD,
      isFist,
    };
  }
}
