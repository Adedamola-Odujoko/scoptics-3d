// FILE: src/LsCalculator.js (REPLACE ENTIRE FILE with Tune 11.0 - "High Volatility")

import { Vector3 } from "three";

/**
 * Calculates the definitive Leakage Score (LS 11.0 - "High Volatility" Tune).
 * This version directly addresses the lack of volatility by replacing the final
 * Math.pow smoothing curve with a high-contrast Sigmoid curve. This new curve
 * pushes low scores closer to zero and high scores closer to one, creating a
 * more dynamic and responsive scoring range.
 *
 * @param {object} lq - The Leakage Quadrant object.
 * @param {Vector3} carrierPosition - The 3D position of the ball carrier.
 * @param {number} pressureOnCarrier - Distance to the nearest defender from the carrier.
 * @param {number} numInterceptors - Number of defenders in the passing cone.
 * @param {Vector3} goalPosition - The 3D position of the center of the goal.
 * @param {object} threatContext - A comprehensive object with all post-reception metrics.
 * @returns {number} The final Leakage Score from 0.0 to 1.0.
 */
export function calculateLs(
  lq,
  carrierPosition,
  pressureOnCarrier,
  numInterceptors,
  goalPosition,
  threatContext
) {
  // --- PART 1: FEASIBILITY SCORE (Unchanged - robust) ---
  const pressureFactor = 1 / (1 + Math.exp(-2.0 * (pressureOnCarrier - 3.0)));
  const obstructionFactor = Math.exp(-0.7 * numInterceptors);
  const distanceToLq = carrierPosition.distanceTo(lq.center);
  const passDistFactor = Math.exp(-0.015 * distanceToLq);

  const feasibilityScore =
    obstructionFactor * 0.5 + pressureFactor * 0.35 + passDistFactor * 0.15;

  // --- PART 2: THREAT SCORE ("Tactical Awareness" Logic) ---
  const distanceToGoal = lq.center.distanceTo(goalPosition);
  const goalDistFactor = Math.exp(-0.045 * distanceToGoal);

  const linearAngleFactor = threatContext.lq_goal_angle_rad / (Math.PI / 2);
  const goalAngleFactor = Math.pow(linearAngleFactor, 1.0);

  const geographicValue = goalDistFactor * 0.9 + goalAngleFactor * 0.1;

  const area = threatContext.lq_area || 0;
  const baseAreaFactor = 1 / (1 + Math.exp(-0.03 * (area - 90)));
  const areaAmplifier = 1.0 + baseAreaFactor * 0.6;

  const isPrimeZone =
    distanceToGoal < 25 && !threatContext.is_lq_in_penalty_box;

  const spaceQualityScore = Math.min(
    1.0,
    geographicValue * areaAmplifier +
      (threatContext.is_lq_in_penalty_box ? 0.25 : 0) +
      (isPrimeZone ? 0.15 : 0)
  );

  if (spaceQualityScore < 0.05) {
    return 0.0;
  }

  const receiverPressureFactor =
    1 - Math.exp(-0.35 * threatContext.def_dist_closest_to_lq);
  const recoveryFactor = 1 - Math.exp(-0.7 * threatContext.def_min_time_to_lq);

  const swarmFactor = 1 / (1 + threatContext.def_num_near_lq * 0.5);

  const defensiveControlScore =
    receiverPressureFactor * 0.5 + recoveryFactor * 0.3 + swarmFactor * 0.2;

  const overloadFactor = Math.min(1, threatContext.att_v_def_lq_radius / 2.0);
  const supportProximityFactor = Math.exp(
    -0.07 * threatContext.dist_second_attacker_to_lq
  );
  const attackingSupportScore =
    overloadFactor * 0.6 + supportProximityFactor * 0.4;

  const apexBonus = defensiveControlScore > 0.85 ? 0.3 : 0;

  const exploitationModifier = Math.min(
    1.0,
    defensiveControlScore * 0.6 + attackingSupportScore * 0.4 + apexBonus
  );

  const threatScore = spaceQualityScore * exploitationModifier;

  // --- FINAL LS 11.0 CALCULATION (High Volatility) ---
  const raw_ls = threatScore * feasibilityScore;

  // --- NEW: High-Contrast Sigmoid Curve ---
  // This curve replaces the old Math.pow. It aggressively pushes scores towards
  // 0 and 1, creating the volatility you're looking for. The steepness (k=5)
  // ensures that scores in the middle (0.4-0.6) are rapidly separated.
  const k = 7; // Steepness of the curve. Higher k = more contrast.
  const final_ls = 1 / (1 + Math.exp(-k * (raw_ls - 0.5)));

  return Math.min(1.0, final_ls);
}
