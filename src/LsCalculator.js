import { Vector3 } from "three";
import {
  findClosestPlayer,
  isPointInTriangle,
  getPassingCone,
} from "./utils.js";

/**
 * Calculates the definitive Leakage Score (LS v14 - Production).
 * This version is the final, stable, and debugged model.
 */
export function calculateLs(lq, carrier, defenders, otherAttackers, goal) {
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

  const situationValue = threatPotentialScore * exploitationScore;
  const raw_ls = situationValue * (0.6 + 0.4 * feasibilityScore);
  const k = 5;
  const final_ls = 1 / (1 + Math.exp(-k * (raw_ls - 0.5)));

  return {
    final_ls: isFinite(final_ls) ? final_ls : 0,
    threatPotentialScore: isFinite(threatPotentialScore)
      ? threatPotentialScore
      : 0,
    exploitationScore: isFinite(exploitationScore) ? exploitationScore : 0,
    feasibilityScore: isFinite(feasibilityScore) ? feasibilityScore : 0,
  };
}

function calculateThreatPotential(lq, goal, defenders, otherAttackers) {
  const CRITICAL_DISTANCE = 16.5,
    IN_BOX_BASE_SCORE = 0.95,
    DECAY_RATE = 0.08;
  const distanceToGoal = lq.center.distanceTo(goal.position);
  let proximityThreat;
  if (distanceToGoal <= CRITICAL_DISTANCE) {
    proximityThreat =
      1.0 - (1.0 - IN_BOX_BASE_SCORE) * (distanceToGoal / CRITICAL_DISTANCE);
  } else {
    const distanceFromBox = distanceToGoal - CRITICAL_DISTANCE;
    proximityThreat =
      IN_BOX_BASE_SCORE * Math.exp(-DECAY_RATE * distanceFromBox);
  }
  const strategicThreat = calculateStrategicBonus(
    lq,
    goal,
    defenders,
    otherAttackers
  );
  const combinedProximityScore = Math.max(proximityThreat, strategicThreat);
  const v_lq_p1 = new Vector3().subVectors(goal.post1, lq.center).normalize();
  const v_lq_p2 = new Vector3().subVectors(goal.post2, lq.center).normalize();
  const angle = v_lq_p1.angleTo(v_lq_p2);
  const normalizedAngle = angle / (Math.PI / 2);
  const goalAngleFactor = Math.pow(normalizedAngle, 0.75);
  const baseAreaFactor = 1 / (1 + Math.exp(-0.04 * (lq.area - 75)));
  const areaAmplifier = 1.0 + baseAreaFactor * 0.4;
  let potential = combinedProximityScore * 0.7 + goalAngleFactor * 0.3;
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
  const lastDefenderX = lastDefender.mesh.position.x;
  const isBehindLine =
    Math.abs(lq.center.x - defendingGoalLineX) <
    Math.abs(lastDefenderX - defendingGoalLineX);
  if (!isBehindLine) return 0.0;
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
  const MAX_BONUS = 0.85;
  const bonus = MAX_BONUS * (1 / (1 + Math.exp(-0.15 * (runway - 35))));
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
  const defSwarmScore = 1 / (1 + defendersNearLq.length * 0.5);
  const defensiveControl = defRecoveryScore * 0.6 + defSwarmScore * 0.4;
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
    attackersNearLq.length / (defendersNearLq.length + 1)
  );
  const attackingPotential = attSupportScore * 0.5 + overloadFactor * 0.5;
  const exploitationScore = attackingPotential * (1 - defensiveControl);
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
