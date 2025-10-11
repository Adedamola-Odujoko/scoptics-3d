import { Vector3 } from "three";
import { findClosestPlayer, isPointInTriangle } from "./utils.js";

/**
 * Calculates the definitive Leakage Score (LS 13.3 - The Context-Aware Model).
 * This version introduces a "Strategic Threat Bonus" to the threat calculation,
 * allowing the model to recognize the immense value of breaking a high defensive line,
 * even if the space is far from goal.
 */
export function calculateLs(lq, carrier, defenders, otherAttackers, goal) {
  // --- PART 1: THREAT POTENTIAL (Now context-aware) ---
  // It now needs player positions to calculate the strategic bonus.
  const threatPotentialScore = calculateThreatPotential(
    lq,
    goal,
    defenders,
    otherAttackers
  );

  if (threatPotentialScore < 0.05) {
    return {
      final_ls: 0.0,
      threatPotentialScore,
      exploitationScore: 0.0,
      feasibilityScore: 0.0,
    };
  }

  // --- PART 2: EXPLOITATION SCORE ---
  const exploitationScore = calculateExploitationScore(
    lq,
    defenders,
    otherAttackers
  );

  // --- PART 3: FEASIBILITY SCORE ---
  const feasibilityScore = calculateFeasibilityScore(lq, carrier, defenders);

  // --- FINAL LS CALCULATION (Potential-Weighted Model) ---
  const situationValue = threatPotentialScore * exploitationScore;
  const raw_ls = situationValue * (0.6 + 0.4 * feasibilityScore);
  const k = 5;
  const final_ls = 1 / (1 + Math.exp(-k * (raw_ls - 0.5)));

  return {
    final_ls: Math.min(1.0, final_ls),
    threatPotentialScore,
    exploitationScore,
    feasibilityScore,
  };
}

/**
 * Calculates threat potential using a dual model:
 * 1. Proximity Threat: Value based on closeness to goal (the hybrid plateau model).
 * 2. Strategic Threat: A massive bonus for breaking the last line of defense.
 * The function returns the MAXIMUM of these two values.
 */
function calculateThreatPotential(lq, goal, defenders, otherAttackers) {
  // --- MODEL 1: PROXIMITY THREAT (Unchanged) ---
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

  // --- MODEL 2: STRATEGIC THREAT (The Counter-Attack Bonus) ---
  const strategicThreat = calculateStrategicBonus(
    lq,
    goal,
    defenders,
    otherAttackers
  );

  // --- COMBINE MODELS ---
  // The base threat is the higher of the two models. A high strategic value
  // can override a low proximity value, correctly valuing a counter-attack.
  const combinedProximityScore = Math.max(proximityThreat, strategicThreat);

  // Apply angle and area modifiers to the combined score
  const v_lq_p1 = new Vector3().subVectors(goal.post1, lq.center).normalize();
  const v_lq_p2 = new Vector3().subVectors(goal.post2, lq.center).normalize();
  const angle = v_lq_p1.angleTo(v_lq_p2);
  const normalizedAngle = angle / (Math.PI / 2);
  const goalAngleFactor = Math.pow(normalizedAngle, 0.75);
  const baseAreaFactor = 1 / (1 + Math.exp(-0.04 * (lq.area - 75)));
  const areaAmplifier = 1.0 + baseAreaFactor * 0.4;
  let potential = combinedProximityScore * 0.7 + goalAngleFactor * 0.3;
  potential *= areaAmplifier;

  return Math.min(1.0, potential);
}

/**
 * Calculates a bonus score for LQs that are behind the defensive line,
 * creating a clear run at goal.
 */
function calculateStrategicBonus(lq, goal, defenders, otherAttackers) {
  if (defenders.length === 0 || otherAttackers.length === 0) return 0.0;

  // 1. Find the last defender (highest X-coordinate if attacking right, lowest if attacking left)
  const goalDirectionSign = Math.sign(goal.position.x); // -1 for home goal, +1 for away goal
  let lastDefenderX = -goalDirectionSign * Infinity;
  defenders.forEach((def) => {
    if (goalDirectionSign < 0) {
      // Attacking leftward goal at -52.5
      if (def.mesh.position.x > lastDefenderX)
        lastDefenderX = def.mesh.position.x;
    } else {
      // Attacking rightward goal at +52.5
      if (def.mesh.position.x < lastDefenderX)
        lastDefenderX = def.mesh.position.x;
    }
  });

  // 2. Check if the LQ is behind the last defender
  const isBehindLine =
    goalDirectionSign < 0
      ? lq.center.x < lastDefenderX
      : lq.center.x > lastDefenderX;

  if (!isBehindLine) return 0.0; // Not a line-breaking opportunity

  // 3. Verify that an attacker is advantaged to reach the LQ
  const { fastestTimeToArrival: attTimeToLq } = calculateTeamControlMetrics(
    lq.center,
    otherAttackers
  );
  const { fastestTimeToArrival: defTimeToLq } = calculateTeamControlMetrics(
    lq.center,
    defenders
  );

  if (defTimeToLq <= attTimeToLq) return 0.0; // Defender can recover, nullify bonus

  // 4. Calculate bonus based on the "runway" to goal
  const runway = lq.center.distanceTo(goal.position);
  const MAX_BONUS = 0.85; // The max threat value a deep run can have
  // A sigmoid function gives a strong bonus that grows with the runway length
  // and plateaus, rewarding runs from deep. Midpoint at 35m.
  const bonus = MAX_BONUS * (1 / (1 + Math.exp(-0.15 * (runway - 35))));

  return bonus;
}

// --- The rest of the functions (Exploitation, Feasibility, Helpers) are UNCHANGED ---

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
  if (attackersNearLq.length === 0) return 0.1;
  const exploitationScore = attackingPotential * (1 - defensiveControl);
  const arrivalTimeAdvantage = Math.max(0, defFastestTime - attFastestTime);
  const speedBonus = 1 + Math.min(0.5, arrivalTimeAdvantage * 0.25);
  return Math.min(1.0, exploitationScore * speedBonus);
}

function calculateFeasibilityScore(lq, carrier, defenders) {
  const carrierPosition = carrier.mesh.position;
  const { distance: pressureOnCarrierDist } = findClosestPlayer(
    carrierPosition,
    defenders
  );
  const pressureFactor =
    1 / (1 + Math.exp(-1.5 * ((pressureOnCarrierDist || 99) - 4.0)));
  const passingCone = getPassingCone(carrierPosition, lq.corners);
  const numInterceptors = defenders.filter((def) =>
    isPointInTriangle(def.mesh.position, ...passingCone.points)
  ).length;
  const obstructionFactor = Math.exp(-0.7 * numInterceptors);
  const distanceToLq = carrierPosition.distanceTo(lq.center);
  const passDistFactor = Math.exp(-0.03 * distanceToLq);
  return (
    obstructionFactor * 0.5 + pressureFactor * 0.35 + passDistFactor * 0.15
  );
}

function calculateTeamControlMetrics(target, players) {
  if (players.length === 0) return { fastestTimeToArrival: 99 };
  let fastestTimeToArrival = Infinity;
  players.forEach((p) => {
    const dist = p.mesh.position.distanceTo(target);
    const effectiveSpeed = Math.max(p.currentSpeed, 4.0);
    const timeToArrival = dist / effectiveSpeed;
    if (timeToArrival < fastestTimeToArrival)
      fastestTimeToArrival = timeToArrival;
  });
  return { fastestTimeToArrival };
}

function getPassingCone(startPoint, quadCorners) {
  let maxAngle = -1,
    coneCorners = [];
  for (let i = 0; i < quadCorners.length; i++) {
    for (let j = i + 1; j < quadCorners.length; j++) {
      const v1 = new Vector3().subVectors(quadCorners[i], startPoint);
      const v2 = new Vector3().subVectors(quadCorners[j], startPoint);
      const angle = v1.angleTo(v2);
      if (angle > maxAngle) {
        maxAngle = angle;
        coneCorners = [quadCorners[i], quadCorners[j]];
      }
    }
  }
  const sortedCorners =
    coneCorners.length > 1 ? coneCorners.sort((a, b) => a.z - b.z) : [];
  return { points: [startPoint, ...sortedCorners], corners: sortedCorners };
}
