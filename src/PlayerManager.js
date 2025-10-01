// src/PlayerManager.js (FINAL VISUAL VERSION)

import { Player } from "./Player.js";
import { teamColors } from "./skeleton.js";
import { Vector3 } from "three";

const interpolatedPosition = new Vector3();

export class PlayerManager {
  constructor(scene, teamColorMap) {
    this.scene = scene;
    this.playerMap = new Map();
    this.teamColorMap = teamColorMap || {};
  }

  updateWithInterpolation(prevFrame, nextFrame, alpha) {
    if (!prevFrame || !nextFrame) return;

    const activePlayerDataSet = nextFrame.players;
    const idsInFrame = new Set(activePlayerDataSet.map((p) => p.id));

    const prevPlayerMap = new Map(prevFrame.players.map((p) => [p.id, p]));

    for (const nextPlayerData of activePlayerDataSet) {
      const id = nextPlayerData.id;
      const prevPlayerData = prevPlayerMap.get(id);

      const color =
        this.teamColorMap[nextPlayerData.team] || teamColors.Unknown;

      let player = this.playerMap.get(id);
      if (!player) {
        // MODIFIED: Pass the entire nextPlayerData object to the constructor
        player = new Player(this.scene, nextPlayerData, color);
        this.playerMap.set(id, player);
      }

      let targetX = nextPlayerData.x;
      let targetY = nextPlayerData.y;

      if (prevPlayerData) {
        targetX =
          prevPlayerData.x + (nextPlayerData.x - prevPlayerData.x) * alpha;
        targetY =
          prevPlayerData.y + (nextPlayerData.y - prevPlayerData.y) * alpha;
      }

      interpolatedPosition.set(targetX / 100.0, 0, targetY / 100.0); // y-position is handled by the cylinder itself

      player.updateTarget(interpolatedPosition, color);
    }

    for (const [id, player] of this.playerMap.entries()) {
      if (!idsInFrame.has(id)) {
        player.destroy(this.scene);
        this.playerMap.delete(id);
      }
    }
  }

  smoothAll(alpha) {
    for (const player of this.playerMap.values()) {
      player.smooth(alpha);
    }
  }
}
