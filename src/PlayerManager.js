// FILE: src/PlayerManager.js

import { Player } from "./Player.js";
import { teamColors } from "./skeleton.js";
import { Vector3 } from "three";

const GRACE_PERIOD_MS = 6000;
const interpolatedPosition = new Vector3();
const POSSESSION_THRESHOLD = 1.5; // Player must be within 1.5 meters of the ball to be considered in possession

// Define which role acronyms belong to which group
const ROLE_GROUPS = {
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
    this.playerInPossession = null; // Tracks the player object currently with the ball
  }

  // This private method is called every frame to determine who has the ball
  _updatePlayerInPossession() {
    // If there's no ball in the scene, no one can have possession.
    if (!this.ball || !this.ball.mesh) {
      if (this.playerInPossession) {
        this.playerInPossession.hidePossessionHighlight();
        this.playerInPossession = null;
      }
      return;
    }

    let closestPlayer = null;
    let minDistance = POSSESSION_THRESHOLD; // Start with the max allowed distance

    // Iterate through all players to find the one closest to the ball
    for (const player of this.playerMap.values()) {
      if (
        player.playerData.name === "Ball" ||
        player.playerData.team === "Referee" ||
        !player.mesh
      )
        continue;

      const dist = player.mesh.position.distanceTo(this.ball.mesh.position);
      if (dist < minDistance) {
        minDistance = dist;
        closestPlayer = player;
      }
    }

    // If the closest player is different from the one who last had the ball
    if (closestPlayer && this.playerInPossession !== closestPlayer) {
      // Hide the highlight on the old player (if there was one)
      if (this.playerInPossession) {
        this.playerInPossession.hidePossessionHighlight();
      }
      // Set the new player and show their highlight
      this.playerInPossession = closestPlayer;
      this.playerInPossession.showPossessionHighlight();
    }
    // If no player is close enough to the ball, clear possession
    else if (!closestPlayer && this.playerInPossession) {
      this.playerInPossession.hidePossessionHighlight();
      this.playerInPossession = null;
    }
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
        if (player === this.playerInPossession) this.playerInPossession = null; // Clear possession if player disappears
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
    // This is called every frame after all player positions have been updated
    this._updatePlayerInPossession();
  }

  getPlayerMeshes() {
    return Array.from(this.playerMap.values(), (player) => player.mesh);
  }
}
