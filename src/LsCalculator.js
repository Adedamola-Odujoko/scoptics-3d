// FILE: src/LsCalculator.js

import { Vector2 } from "three";

function calculatePolygonArea(corners) {
  let area = 0;
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % n];
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(area / 2.0);
}

export function calculateLs(
  lq,
  pressureOnCarrier,
  numInterceptors,
  receiverInfo,
  goalPosition
) {
  // --- 1. Space Quality Factors ---
  const areaOfLQ = calculatePolygonArea(
    lq.corners.map((c) => new Vector2(c.x, c.z))
  );
  const distanceToGoal = lq.center.distanceTo(goalPosition);
  if (distanceToGoal < 1) return 1.0;

  // --- 2. Exploitation Potential (Payoff) ---
  if (!receiverInfo.player) return 0.0;

  // --- 3. TRANSFORM THE AREA VARIABLE (This is essential) ---
  const transformedArea = Math.sqrt(areaOfLQ);

  // --- 4. "BALANCED" WEIGHTS ---
  // We're making the base score less punishing and reducing the defender penalty slightly.
  const weights = {
    area: 0.12, // Slightly increased reward for space
    goal_dist: 0.2, // Proximity to goal remains very important
    carrier_pressure: 0.05, // Carrier having space is a moderate bonus
    path_clear: -0.7, // Strong, but not overwhelming, penalty for each defender
    receiver_prox: 1.3, // Strong reward for having a teammate ready to receive
    intercept: -1.0, // **MODERATED** negative base intercept. This is the key change.
  };

  const receiverProximityFactor = 1 / Math.max(receiverInfo.distance, 1.0);

  const z =
    weights.intercept +
    weights.area * transformedArea +
    weights.goal_dist * (1 / distanceToGoal) +
    weights.carrier_pressure * pressureOnCarrier +
    weights.path_clear * numInterceptors +
    weights.receiver_prox * receiverProximityFactor;

  // --- DEBUGGING: Uncomment this to see the new, balanced contributions ---

  console.log({
    z_final: z.toFixed(2),
    ls_score: (1 / (1 + Math.exp(-z))).toFixed(2),
    Intercept: weights.intercept,
    "Area (Transformed)": (weights.area * transformedArea).toFixed(2),
    "Goal Prox": (weights.goal_dist * (1 / distanceToGoal)).toFixed(2),
    "Carrier Freedom": (weights.carrier_pressure * pressureOnCarrier).toFixed(
      2
    ),
    "Path Obstruction": (weights.path_clear * numInterceptors).toFixed(2),
    "Receiver Prox": (weights.receiver_prox * receiverProximityFactor).toFixed(
      2
    ),
  });

  const ls = 1 / (1 + Math.exp(-z));
  return ls;
}
