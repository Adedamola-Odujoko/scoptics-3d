import { Vector3 } from "three";
import {
  findClosestPlayer,
  isPointInTriangle,
  getPassingCone,
} from "./utils.js";

/**
 * Calculates the definitive Leakage Score (LS v15 - Hybrid Philosophy Model).
 * This version uses a sophisticated blend of multiplicative and additive models
 * for the Situation Value, controlled by the alpha (α) parameter.
 */
export function calculateLs(lq, carrier, defenders, otherAttackers, goal) {
  // --- TOP-LEVEL TUNING PARAMETERS ---
  const ALPHA = 0.2; // The "Philosophy Slider". 1.0 = pure product, 0.0 = pure average.
  const BASE = 0.4; // The weight of latent potential in the final score.
  const SCALE = 0.6; // The weight of realizable potential (feasibility) in the final score.
  const K = 10.0; // The steepness of the final contrast curve.

  const threatPotentialScore = calculateThreatPotential(
    lq,
    goal,
    defenders,
    otherAttackers
  );
  const exploitationScore = calculateExploitationScore(
    lq,
    defenders,
    otherAttackers
  );
  const feasibilityScore = calculateFeasibilityScore(lq, carrier, defenders);

  // 1. Calculate Situation Value using the Hybrid Philosophy Model
  const productValue = threatPotentialScore * exploitationScore;
  const averageValue = (threatPotentialScore + exploitationScore) / 2;
  const situationValue = ALPHA * productValue + (1 - ALPHA) * averageValue;

  // 2. Calculate raw_ls using the Potential-Weighted feasibility model
  const raw_ls = situationValue * (BASE + SCALE * feasibilityScore);

  // 3. Apply the final contrast curve (Sigmoid)
  const final_ls = 1 / (1 + Math.exp(-K * (raw_ls - 0.5)));

  return {
    final_ls: isFinite(final_ls) ? final_ls : 0,
    threatPotentialScore: isFinite(threatPotentialScore)
      ? threatPotentialScore
      : 0,
    exploitationScore: isFinite(exploitationScore) ? exploitationScore : 0,
    feasibilityScore: isFinite(feasibilityScore) ? feasibilityScore : 0,
  };
}

// --- The component calculation functions below are UNCHANGED ---

function calculateThreatPotential(lq, goal, defenders, otherAttackers) {
  const MIDPOINT_DISTANCE = 30,
    STEEPNESS = 0.6;
  const distanceToGoal = lq.center.distanceTo(goal.position);
  const proximityThreat =
    1 / (1 + Math.exp(STEEPNESS * (distanceToGoal - MIDPOINT_DISTANCE)));
  const strategicThreat = calculateStrategicBonus(
    lq,
    goal,
    defenders,
    otherAttackers
  );
  const combinedProximityScore = Math.max(proximityThreat, strategicThreat);
  const angle = new Vector3()
    .subVectors(goal.post1, lq.center)
    .angleTo(new Vector3().subVectors(goal.post2, lq.center));
  const goalAngleFactor = Math.pow(angle / (Math.PI / 2), 0.75);
  const areaAmplifier =
    1.0 + (1 / (1 + Math.exp(-0.04 * (lq.area - 75)))) * 0.6;
  let potential = combinedProximityScore * 0.5 + goalAngleFactor * 0.5;
  potential *= areaAmplifier;
  return Math.min(1.0, isFinite(potential) ? potential : 0);
}

function calculateStrategicBonus(lq, goal, defenders, otherAttackers) {
  if (defenders.length === 0 || otherAttackers.length === 0) return 0.0;
  const defendingGoalLineX = -goal.position.x;
  let lastDefender = null;
  let minDistanceToOwnGoal = Infinity;
  for (const def of defenders) {
    const dist = Math.abs(def.mesh.position.x - defendingGoalLineX);
    if (dist < minDistanceToOwnGoal) {
      minDistanceToOwnGoal = dist;
      lastDefender = def;
    }
  }
  if (!lastDefender) return 0.0;
  if (
    Math.abs(lq.center.x - defendingGoalLineX) >=
    Math.abs(lastDefender.mesh.position.x - defendingGoalLineX)
  )
    return 0.0;
  const { fastestTimeToArrival: attTimeToLq } = calculateTeamControlMetrics(
    lq.center,
    otherAttackers
  );
  const { fastestTimeToArrival: defTimeToLq } = calculateTeamControlMetrics(
    lq.center,
    defenders
  );
  if (defTimeToLq <= attTimeToLq) return 0.0;
  const runway = lq.center.distanceTo(goal.position);
  const bonus = 0.85 * (1 / (1 + Math.exp(-0.6 * (runway - 35))));
  return isFinite(bonus) ? bonus : 0;
}

function calculateExploitationScore(lq, defenders, otherAttackers) {
  const ANALYSIS_RADIUS = 20;
  const defendersNearLq = defenders.filter(
    (p) => p.mesh.position.distanceTo(lq.center) < ANALYSIS_RADIUS
  );
  const { fastestTimeToArrival: defFastestTime } = calculateTeamControlMetrics(
    lq.center,
    defendersNearLq
  );
  const defRecoveryScore = Math.exp(-0.5 * defFastestTime);
  const defSwarmScore = 1 / (1 + (defendersNearLq.length / 2) * 0.5);
  const defensiveControl = defRecoveryScore * 0.8 + defSwarmScore * 0.2;
  const attackersNearLq = otherAttackers.filter(
    (p) => p.mesh.position.distanceTo(lq.center) < ANALYSIS_RADIUS
  );
  if (attackersNearLq.length === 0) return 0.1;
  const { fastestTimeToArrival: attFastestTime } = calculateTeamControlMetrics(
    lq.center,
    attackersNearLq
  );
  const attSupportScore = Math.exp(-0.3 * attFastestTime);
  const overloadFactor = Math.min(
    1.0,
    (attackersNearLq.length + 0.5) / (defendersNearLq.length + 1)
  );
  const attackingPotential = attSupportScore * 0.5 + overloadFactor * 0.5;
  const exploitationScore =
    attackingPotential * Math.pow(1 - defensiveControl, 0.5);
  const arrivalTimeAdvantage = Math.max(0, defFastestTime - attFastestTime);
  const speedBonus = 1 + Math.min(0.5, arrivalTimeAdvantage * 0.25);
  const finalScore = Math.min(1.0, exploitationScore * speedBonus);
  return isFinite(finalScore) ? finalScore : 0;
}

function calculateFeasibilityScore(lq, carrier, defenders) {
  const carrierPosition = carrier.mesh.position;
  const { distance: pressureOnCarrierDist } = findClosestPlayer(
    carrierPosition,
    defenders
  );
  const pressureFactor =
    1 / (1 + Math.exp(-1.5 * ((pressureOnCarrierDist || 99) - 4.0)));
  const { points: conePoints } = getPassingCone(carrierPosition, lq.corners);
  const numInterceptors = defenders.filter((def) =>
    isPointInTriangle(def.mesh.position, ...conePoints)
  ).length;
  const obstructionFactor = Math.exp(-0.7 * numInterceptors);
  const distanceToLq = carrierPosition.distanceTo(lq.center);
  const passDistFactor = Math.exp(-0.03 * distanceToLq);
  const finalScore =
    obstructionFactor * 0.5 + pressureFactor * 0.35 + passDistFactor * 0.15;
  return isFinite(finalScore) ? finalScore : 0;
}

function calculateTeamControlMetrics(target, players) {
  if (players.length === 0) return { fastestTimeToArrival: 99 };
  let fastestTimeToArrival = Infinity;
  players.forEach((p) => {
    if (typeof p.currentSpeed !== "number" || isNaN(p.currentSpeed)) {
      p.currentSpeed = 0;
    }
    const dist = p.mesh.position.distanceTo(target);
    const effectiveSpeed = Math.max(p.currentSpeed, 4.0);
    const timeToArrival = dist / effectiveSpeed;
    if (timeToArrival < fastestTimeToArrival)
      fastestTimeToArrival = timeToArrival;
  });
  return {
    fastestTimeToArrival: isFinite(fastestTimeToArrival)
      ? fastestTimeToArrival
      : 99,
  };
}
