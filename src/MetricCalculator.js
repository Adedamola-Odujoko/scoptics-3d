// FILE: src/MetricCalculator.js

import { Vector2, Vector3 } from "three";

// --- HELPER FUNCTIONS ---
function findClosestPlayer(targetPosition, players) {
  let closestPlayer = null;
  let minDistance = Infinity;
  for (const player of players) {
    if (!player || !player.mesh) continue;
    const distance = player.mesh.position.distanceTo(targetPosition);
    if (distance < minDistance) {
      minDistance = distance;
      closestPlayer = player;
    }
  }
  return { player: closestPlayer, distance: minDistance };
}

function isPointInTriangle(p, p0, p1, p2) {
  const p_2d = new Vector2(p.x, p.z);
  const p0_2d = new Vector2(p0.x, p0.z);
  const p1_2d = new Vector2(p1.x, p1.z);
  const p2_2d = new Vector2(p2.x, p2.z);
  const s =
    p0_2d.y * p2_2d.x -
    p0_2d.x * p2_2d.y +
    (p2_2d.y - p0_2d.y) * p_2d.x +
    (p0_2d.x - p2_2d.x) * p_2d.y;
  const t =
    p0_2d.x * p1_2d.y -
    p0_2d.y * p1_2d.x +
    (p0_2d.y - p1_2d.y) * p_2d.x +
    (p1_2d.x - p0_2d.x) * p_2d.y;
  if (s < 0 != t < 0 && s != 0 && t != 0) return false;
  const A =
    -p1_2d.y * p2_2d.x +
    p0_2d.y * (p2_2d.x - p1_2d.x) +
    p0_2d.x * (p1_2d.y - p2_2d.y) +
    p1_2d.x * p2_2d.y;
  return A < 0 ? s <= 0 && s + t >= A : s >= 0 && s + t <= A;
}

function calculatePolygonArea(corners) {
  let area = 0;
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % n];
    area += p1.x * p2.z - p2.x * p1.z;
  }
  return Math.abs(area / 2.0);
}

/**
 * The main function to calculate all desired metrics for a single data entry.
 */
export function calculateAllMetrics(
  lq,
  playerManager,
  timestamp,
  ls_heuristic
) {
  const allMetrics = {};

  const playerInPossession = playerManager.playerInPossession;
  if (!playerInPossession) return null;

  const attackingTeamName = playerInPossession.playerData.team;
  const homeTeamName = playerManager.metadata.home_team.name;
  const defendingTeamName =
    attackingTeamName === homeTeamName
      ? playerManager.metadata.away_team.name
      : homeTeamName;

  const attackers = playerManager.getAllTeamPlayers(attackingTeamName);
  const defenders = playerManager.getAllTeamPlayers(defendingTeamName);

  // --- I. CORE POSITIONAL & TEAM DATA ---
  allMetrics.timestamp = timestamp;
  allMetrics.player_in_possession_id = playerInPossession.playerData.id;
  allMetrics.attacking_team = attackingTeamName;

  const allPlayers = Array.from(playerManager.playerMap.values());
  for (const player of allPlayers) {
    if (player.playerData.name === "Ball") continue;
    const pData = player.playerData;
    const prefix = pData.id;
    allMetrics[`${prefix}_x`] = player.mesh.position.x;
    allMetrics[`${prefix}_z`] = player.mesh.position.z;
    allMetrics[`${prefix}_team`] = pData.team;
  }
  allMetrics["ball_x"] = playerManager.ball.mesh.position.x;
  allMetrics["ball_z"] = playerManager.ball.mesh.position.z;

  // --- II. DEFENDING TEAM STRUCTURE METRICS ---
  const defensiveLine = playerManager
    .getPlayersByGroup(defendingTeamName, "backline")
    .sort((a, b) => a.mesh.position.z - b.mesh.position.z);
  const midfieldLine = playerManager.getPlayersByGroup(
    defendingTeamName,
    "midfield"
  );

  if (defensiveLine.length > 1) {
    allMetrics.def_line_width = Math.abs(
      defensiveLine[0].mesh.position.z -
        defensiveLine[defensiveLine.length - 1].mesh.position.z
    );
    allMetrics.def_line_height_avg =
      defensiveLine.reduce((sum, p) => sum + p.mesh.position.x, 0) /
      defensiveLine.length;

    let gaps = [];
    for (let i = 0; i < defensiveLine.length - 1; i++) {
      gaps.push(
        defensiveLine[i].mesh.position.distanceTo(
          defensiveLine[i + 1].mesh.position
        )
      );
    }
    allMetrics.def_line_avg_gap = gaps.reduce((s, v) => s + v, 0) / gaps.length;
    allMetrics.def_line_max_gap = Math.max(...gaps);
  }

  if (midfieldLine.length > 0 && defensiveLine.length > 0) {
    const mid_avg_height =
      midfieldLine.reduce((sum, p) => sum + p.mesh.position.x, 0) /
      midfieldLine.length;
    allMetrics.def_dist_between_lines = Math.abs(
      allMetrics.def_line_height_avg - mid_avg_height
    );
  }

  const allDefendersPos = defenders.map((p) => p.mesh.position);
  if (allDefendersPos.length > 0) {
    const xs = allDefendersPos.map((p) => p.x);
    const zs = allDefendersPos.map((p) => p.z);
    allMetrics.def_compactness_vertical = Math.max(...xs) - Math.min(...xs);
    allMetrics.def_compactness_horizontal = Math.max(...zs) - Math.min(...zs);
    allMetrics.def_centroid_x = xs.reduce((s, v) => s + v, 0) / xs.length;
    allMetrics.def_centroid_z = zs.reduce((s, v) => s + v, 0) / zs.length;
  }

  // --- III. ATTACKING TEAM & EXPLOITATION POTENTIAL ---
  allMetrics.lq_center_x = lq.center.x;
  allMetrics.lq_center_z = lq.center.z;
  allMetrics.lq_corner1_x = lq.corners[0].x;
  allMetrics.lq_corner1_z = lq.corners[0].z;
  allMetrics.lq_corner2_x = lq.corners[1].x;
  allMetrics.lq_corner2_z = lq.corners[1].z;
  allMetrics.lq_corner3_x = lq.corners[2].x;
  allMetrics.lq_corner3_z = lq.corners[2].z;
  allMetrics.lq_corner4_x = lq.corners[3].x;
  allMetrics.lq_corner4_z = lq.corners[3].z;
  allMetrics.ls_heuristic = ls_heuristic; // This is our ground truth target label
  allMetrics.lq_area = calculatePolygonArea(lq.corners);

  allMetrics.dist_carrier_to_lq = playerInPossession.mesh.position.distanceTo(
    lq.center
  );

  const otherAttackers = attackers.filter((p) => p !== playerInPossession);
  const closestAttackerInfo = findClosestPlayer(lq.center, otherAttackers);
  allMetrics.dist_closest_attacker_to_lq = closestAttackerInfo.distance;

  const attackersNearLQ_10m = otherAttackers.filter(
    (p) => p.mesh.position.distanceTo(lq.center) < 10
  ).length;
  allMetrics.num_attackers_near_lq = attackersNearLQ_10m;

  // Cone calculation
  let maxAngle = -1;
  let coneCorners = [];
  for (let i = 0; i < lq.corners.length; i++) {
    for (let j = i + 1; j < lq.corners.length; j++) {
      const v1 = new Vector3().subVectors(
        lq.corners[i],
        playerInPossession.mesh.position
      );
      const v2 = new Vector3().subVectors(
        lq.corners[j],
        playerInPossession.mesh.position
      );
      const angle = v1.angleTo(v2);
      if (angle > maxAngle) {
        maxAngle = angle;
        coneCorners = [lq.corners[i], lq.corners[j]];
      }
    }
  }
  allMetrics.path_cone_angle_rad = maxAngle;
  if (coneCorners.length > 1) {
    const conePoints = [playerInPossession.mesh.position, ...coneCorners];
    allMetrics.path_num_interceptors = defenders.filter((def) =>
      isPointInTriangle(def.mesh.position, ...conePoints)
    ).length;
  } else {
    allMetrics.path_num_interceptors = 0;
  }

  // Off-ball runner info for the closest attacker
  if (closestAttackerInfo.player) {
    allMetrics.closest_attacker_speed = closestAttackerInfo.player.currentSpeed;
    allMetrics.closest_attacker_velocity_x =
      closestAttackerInfo.player.velocity.x;
    allMetrics.closest_attacker_velocity_z =
      closestAttackerInfo.player.velocity.z;
  }

  // --- IV. CONTEXTUAL & PLAYER-SPECIFIC ---
  allMetrics.pressure_on_carrier_dist = findClosestPlayer(
    playerInPossession.mesh.position,
    defenders
  ).distance;
  allMetrics.pressure_on_carrier_num_3m = defenders.filter(
    (p) => p.mesh.position.distanceTo(playerInPossession.mesh.position) < 3
  ).length;

  // NOTE: Player Body Orientation is not available from the current data.
  // We can add placeholders for future use.
  allMetrics.carrier_orientation = null;

  // Round all numeric values
  for (const key in allMetrics) {
    if (typeof allMetrics[key] === "number") {
      allMetrics[key] = parseFloat(allMetrics[key].toFixed(4));
    }
  }

  return allMetrics;
}
