// FILE: src/PlayerManager.js

import { Player } from "./Player.js";
import { teamColors } from "./skeleton.js";
import { Vector3 } from "three";

const GRACE_PERIOD_MS = 6000;
const interpolatedPosition = new Vector3();

// Define which role acronyms belong to which group
const ROLE_GROUPS = {
  // NEW: "backline" for defenders only, excluding the GK.
  backline: ["LCB", "RCB", "CB", "LWB", "RWB", "LB", "RB"],
  midfield: ["CM", "LM", "RM", "CDM", "CAM", "DM", "AM"],
  attack: ["LW", "RW", "CF", "ST"],
  spine: ["GK", "LCB", "RCB", "CB", "CM", "CDM", "CAM", "DM", "AM", "CF", "ST"],
};

export class PlayerManager {
  constructor(scene, teamColorMap, metadata) {
    this.scene = scene;
    this.playerMap = new Map();
    this.teamColorMap = teamColorMap || {};
    this.metadata = metadata;
    this.lastSeen = new Map();
    this.ball = null;
  }

  updateWithInterpolation(prevFrame, nextFrame, alpha) {
    if (!prevFrame || !nextFrame) return;

    const activePlayerDataSet = nextFrame.players;
    const prevPlayerMap = new Map(prevFrame.players.map((p) => [p.id, p]));
    const now = performance.now();

    for (const nextPlayerData of activePlayerDataSet) {
      const id = nextPlayerData.id;
      this.lastSeen.set(id, now);

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

  getPlayersByGroup(teamName, group) {
    const roles = ROLE_GROUPS[group];
    if (!roles) return [];

    const players = [];
    for (const player of this.playerMap.values()) {
      if (
        player.playerData.team === teamName &&
        roles.includes(player.playerData.role)
      ) {
        players.push(player);
      }
    }
    return players;
  }

  getAllTeamPlayers(teamName) {
    const players = [];
    for (const player of this.playerMap.values()) {
      if (
        player.playerData.team === teamName &&
        player.playerData.role !== "BALL" &&
        player.playerData.role !== "REF"
      ) {
        players.push(player);
      }
    }
    return players;
  }

  smoothAll(alpha, dt) {
    for (const player of this.playerMap.values()) {
      player.smooth(alpha, dt);
    }
  }

  getPlayerMeshes() {
    return Array.from(this.playerMap.values(), (player) => player.mesh);
  }
}
