// src/PlayerManager.js (REVERTED to stable grace period)

import { Player } from "./Player.js";
import { teamColors } from "./skeleton.js";
import { Vector3 } from "three";

const GRACE_PERIOD_MS = 6000;
const interpolatedPosition = new Vector3();

export class PlayerManager {
  constructor(scene, teamColorMap) {
    this.scene = scene;
    this.playerMap = new Map();
    this.teamColorMap = teamColorMap || {};
    this.lastSeen = new Map();
    this.ball = null;
  }

  updateWithInterpolation(prevFrame, nextFrame, alpha) {
    if (!prevFrame || !nextFrame) return;

    const activePlayerDataSet = nextFrame.players;
    const prevPlayerMap = new Map(prevFrame.players.map((p) => [p.id, p]));
    const now = performance.now();

    // --- (Phase 1) Update players that have fresh data ---
    for (const nextPlayerData of activePlayerDataSet) {
      const id = nextPlayerData.id;
      this.lastSeen.set(id, now); // Update their timestamp

      const prevPlayerData = prevPlayerMap.get(id);
      const color =
        this.teamColorMap[nextPlayerData.team] || teamColors.Unknown;

      let player = this.playerMap.get(id);
      if (!player) {
        player = new Player(this.scene, nextPlayerData, color, this);
        this.playerMap.set(id, player);
        if (nextPlayerData.name === "Ball") {
          this.ball = player;
        }
      }

      let targetX = nextPlayerData.x;
      let targetY = nextPlayerData.y;
      if (prevPlayerData) {
        targetX =
          prevPlayerData.x + (nextPlayerData.x - prevPlayerData.x) * alpha;
        targetY =
          prevPlayerData.y + (nextPlayerData.y - prevPlayerData.y) * alpha;
      }

      interpolatedPosition.set(targetX / 100.0, 0, targetY / 100.0);
      player.updateTarget(interpolatedPosition, color);
    }

    // --- (Phase 2) Remove players whose grace period has expired ---
    // Note: We no longer have a phase for extrapolation. Players not in the
    // activePlayerDataSet are simply not updated, so they will freeze.
    for (const [id, player] of this.playerMap.entries()) {
      const lastSeenTime = this.lastSeen.get(id);
      if (now - lastSeenTime > GRACE_PERIOD_MS) {
        if (player === this.ball) this.ball = null;
        player.destroy(this.scene);
        this.playerMap.delete(id);
        this.lastSeen.delete(id);
      }
    }
  }

  smoothAll(alpha) {
    for (const player of this.playerMap.values()) {
      player.smooth(alpha);
    }
  }

  getPlayerMeshes() {
    return Array.from(this.playerMap.values(), (player) => player.mesh);
  }
}
