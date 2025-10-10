// FILE: src/LsCalculator.js (REPLACE ENTIRE FILE with Tune 6.0 - "The Amplifier")

import { Vector3 } from "three";

/**
 * Calculates the definitive Leakage Score (LS 6.0 - "The Amplifier" Tune).
 * This version fundamentally changes the final calculation from multiplication to a
 * weighted average of Feasibility and Threat. This prevents score suppression and ensures
 * that high marks in one category contribute strongly to the final score. It also
 * re-calibrates component factors to be more generous, lifting the entire score range
 * to feel more representative of high-level opportunities.
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
  // --- PART 1: FEASIBILITY SCORE (Re-calibrated for higher output) ---

  // RE-CALIBRATED: Sigmoid centered at 2.5m, giving players more "thinking time".
  const pressureFactor = 1 / (1 + Math.exp(-2.5 * (pressureOnCarrier - 2.5)));
  // RE-CALIBRATED: Slightly softer penalty for interceptors.
  const obstructionFactor = Math.exp(-0.8 * numInterceptors);
  const distanceToLq = carrierPosition.distanceTo(lq.center);
  // RE-CALIBRATED: Less punitive for longer passes.
  const passDistFactor = Math.exp(-0.018 * distanceToLq);

  const feasibilityScore =
    obstructionFactor * 0.5 + pressureFactor * 0.35 + passDistFactor * 0.15;

  // --- PART 2: THREAT SCORE (Re-calibrated for higher output) ---

  // Component 2a: The Gatekeeper - Quality of Space
  const distanceToGoal = lq.center.distanceTo(goalPosition);
  // RE-CALIBRATED: Softer distance penalty.
  const goalDistFactor = Math.exp(-0.035 * distanceToGoal);
  const goalAngleFactor = threatContext.lq_goal_angle_rad / (Math.PI / 2);
  // RE-CALIBRATED: Sigmoid centered at 60m^2, rewarding medium-sized spaces more.
  const area = threatContext.lq_area || 0;
  const areaFactor = 1 / (1 + Math.exp(-0.05 * (area - 60)));
  const penaltyBoxBonus = threatContext.is_lq_in_penalty_box ? 0.25 : 0;

  const spaceQualityScore = Math.min(
    1.0,
    goalDistFactor * 0.45 +
      areaFactor * 0.35 +
      goalAngleFactor * 0.2 +
      penaltyBoxBonus
  );

  if (spaceQualityScore < 0.01) {
    return 0.0;
  }

  // Component 2b: The Modifiers
  const receiverPressureFactor =
    1 - Math.exp(-0.3 * threatContext.def_dist_closest_to_lq); // More sensitive
  const recoveryFactor = 1 - Math.exp(-0.6 * threatContext.def_min_time_to_lq); // More sensitive
  const defensiveControlScore =
    receiverPressureFactor * 0.6 + recoveryFactor * 0.4;

  const overloadFactor = Math.min(1, threatContext.att_v_def_lq_radius / 2.0);
  const supportProximityFactor = Math.exp(
    -0.07 * threatContext.dist_second_attacker_to_lq // More forgiving
  );
  const attackingSupportScore =
    overloadFactor * 0.6 + supportProximityFactor * 0.4;

  const exploitationModifier =
    defensiveControlScore * 0.7 + attackingSupportScore * 0.3;

  const threatScore = spaceQualityScore * exploitationModifier;

  // --- NEW: FINAL LS 6.0 CALCULATION (Weighted Average) ---
  // This is the core change. Instead of multiplying Feasibility and Threat, which
  // crushes the score, we average them. An opportunity is 50% "Can we get it there?"
  // and 50% "Is it dangerous?". This preserves the signal from high scores in either category.
  const raw_ls = feasibilityScore * 0.5 + threatScore * 0.5;

  // Final scaling curve remains to provide a good "feel" and differentiate scores.
  const final_ls = Math.pow(raw_ls, 0.7);

  return Math.min(1.0, final_ls);
}
