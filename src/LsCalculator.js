import { Vector3 } from "three";
import {
  findClosestPlayer,
  isPointInTriangle,
  getPassingCone,
} from "./utils.js";

// This is your tuned file, now modified to return detailed objects.
export function calculateLs(
  lq,
  carrier,
  defenders,
  otherAttackers,
  goal,
  attackingDirection
) {
  const threatDetails = calculateThreatPotential(
    lq,
    goal,
    defenders,
    otherAttackers,
    attackingDirection
  );
  const exploitDetails = calculateExploitationScore(
    lq,
    defenders,
    otherAttackers
  );
  const feasyDetails = calculateFeasibilityScore(lq, carrier, defenders);

  const threatPotentialScore = threatDetails.potential;
  const exploitationScore = exploitDetails.finalScore;
  const feasibilityScore = feasyDetails.finalScore;

  const ALPHA = 0.4,
    BASE = 0.5,
    SCALE = 0.5,
    K = 7.0;
  const productValue = threatPotentialScore * exploitationScore;
  const averageValue = (threatPotentialScore + exploitationScore) / 2;
  const situationValue = ALPHA * productValue + (1 - ALPHA) * averageValue;
  const raw_ls = situationValue * (BASE + SCALE * feasibilityScore);
  const final_ls = 1 / (1 + Math.exp(-K * (raw_ls - 0.5)));

  return {
    final_ls: isFinite(final_ls) ? final_ls : 0,
    threatPotentialScore,
    exploitationScore,
    feasibilityScore,
    details: {
      threat: threatDetails,
      exploit: exploitDetails,
      feasy: feasyDetails,
      final: { situationValue, raw_ls },
    },
  };
}

function calculateThreatPotential(
  lq,
  goal,
  defenders,
  otherAttackers,
  attackingDirection
) {
  const MIDPOINT_DISTANCE = 30,
    STEEPNESS = 0.25;
  const proximityThreat =
    1 /
    (1 +
      Math.exp(
        STEEPNESS * (lq.center.distanceTo(goal.position) - MIDPOINT_DISTANCE)
      ));
  const strategicThreat = calculateStrategicBonus(
    lq,
    goal,
    defenders,
    otherAttackers,
    attackingDirection
  );
  const combinedProximityScore = Math.max(proximityThreat, strategicThreat);
  const angle = new Vector3()
    .subVectors(goal.post1, lq.center)
    .angleTo(new Vector3().subVectors(goal.post2, lq.center));
  const goalAngleFactor = Math.pow(angle / (Math.PI / 2), 0.75);
  const areaAmplifier =
    1.0 + (1 / (1 + Math.exp(-0.04 * (lq.area - 75)))) * 0.4;
  let potential = combinedProximityScore * 0.6 + goalAngleFactor * 0.4;
  potential *= areaAmplifier;

  return {
    potential: Math.min(1.0, isFinite(potential) ? potential : 0),
    proximityThreat,
    strategicThreat,
    combinedProximityScore,
    goalAngleFactor,
    areaAmplifier,
  };
}

function calculateStrategicBonus(
  lq,
  goal,
  defenders,
  otherAttackers,
  attackingDirection
) {
  if (!defenders.length || !otherAttackers.length || !attackingDirection)
    return 0.0;
  let lastDefender = null;
  let offsideLineX;
  if (attackingDirection < 0) {
    offsideLineX = Infinity;
    for (const def of defenders) {
      if (def.playerData.role !== "GK" && def.mesh.position.x < offsideLineX) {
        offsideLineX = def.mesh.position.x;
        lastDefender = def;
      }
    }
  } else {
    offsideLineX = -Infinity;
    for (const def of defenders) {
      if (def.playerData.role !== "GK" && def.mesh.position.x > offsideLineX) {
        offsideLineX = def.mesh.position.x;
        lastDefender = def;
      }
    }
  }
  if (!lastDefender) return 0.0;
  let isBehindLine =
    attackingDirection < 0
      ? lq.center.x < offsideLineX
      : lq.center.x > offsideLineX;
  if (!isBehindLine) return 0.0;
  const { fastestTimeToArrival: attTTA } = calculateTeamControlMetrics(
    lq.center,
    otherAttackers
  );
  const { fastestTimeToArrival: defTTA } = calculateTeamControlMetrics(
    lq.center,
    defenders
  );
  if (defTTA <= attTTA) return 0.0;
  const runway = lq.center.distanceTo(goal.position);
  const bonus = 0.95 * (1 / (1 + Math.exp(-0.25 * (runway - 20))));
  return isFinite(bonus) ? bonus : 0;
}

function calculateExploitationScore(lq, defenders, otherAttackers) {
  const ANALYSIS_RADIUS = 40;
  const defendersNearLq = defenders.filter(
    (p) => p.mesh.position.distanceTo(lq.center) < ANALYSIS_RADIUS
  );
  const { fastestTimeToArrival: defFastestTime } = calculateTeamControlMetrics(
    lq.center,
    defendersNearLq
  );
  const defRecoveryScore = Math.exp(-0.7 * defFastestTime);
  const defSwarmScore = 1 / (1 + defendersNearLq.length * 0.5);
  const defensiveControl = defRecoveryScore * 0.6 + defSwarmScore * 0.4;
  const attackersNearLq = otherAttackers.filter(
    (p) => p.mesh.position.distanceTo(lq.center) < ANALYSIS_RADIUS
  );
  const attSupport =
    attackersNearLq.length === 0
      ? { potential: 0.1, tta: 99, score: 0, overload: 0 }
      : (() => {
          const { fastestTimeToArrival: tta } = calculateTeamControlMetrics(
            lq.center,
            attackersNearLq
          );
          const score = Math.exp(-0.3 * tta);
          const overload = Math.min(
            1.0,
            (attackersNearLq.length + 0.5) / (defendersNearLq.length + 1)
          );
          const potential = score * 0.5 + overload * 0.5;
          return { potential, tta, score, overload };
        })();
  const exploitationScore =
    attSupport.potential * Math.pow(1 - defensiveControl, 0.5);
  const arrivalTimeAdvantage = Math.max(0, defFastestTime - attSupport.tta);
  const speedBonus = 1 + Math.min(0.5, arrivalTimeAdvantage * 0.25);
  const finalScore = Math.min(1.0, exploitationScore * speedBonus);

  return {
    finalScore: isFinite(finalScore) ? finalScore : 0,
    defFastestTime,
    defRecoveryScore,
    defSwarmScore,
    defensiveControl,
    attFastestTime: attSupport.tta,
    attSupportScore: attSupport.score,
    overloadFactor: attSupport.overload,
    attackingPotential: attSupport.potential,
    speedBonus,
  };
}

function calculateFeasibilityScore(lq, carrier, defenders) {
  const { distance: pressureDist } = findClosestPlayer(
    carrier.mesh.position,
    defenders
  );
  const pressureFactor =
    1 / (1 + Math.exp(-1.5 * ((pressureDist || 99) - 4.0)));
  const { points: conePoints } = getPassingCone(
    carrier.mesh.position,
    lq.corners
  );
  const numInterceptors = defenders.filter((def) =>
    isPointInTriangle(def.mesh.position, ...conePoints)
  ).length;
  const obstructionFactor = Math.exp(-0.7 * numInterceptors);
  const passDistFactor = Math.exp(
    -0.03 * carrier.mesh.position.distanceTo(lq.center)
  );
  const finalScore =
    obstructionFactor * 0.5 + pressureFactor * 0.35 + passDistFactor * 0.15;

  return {
    finalScore: isFinite(finalScore) ? finalScore : 0,
    pressureDist: pressureDist || 99,
    pressureFactor,
    numInterceptors,
    obstructionFactor,
    passDistFactor,
  };
}

function calculateTeamControlMetrics(target, players) {
  if (players.length === 0) return { fastestTimeToArrival: 99 };
  let fastestTimeToArrival = Infinity;
  players.forEach((p) => {
    if (typeof p.currentSpeed !== "number" || isNaN(p.currentSpeed))
      p.currentSpeed = 0;
    const timeToArrival =
      p.mesh.position.distanceTo(target) / Math.max(p.currentSpeed, 4.0);
    if (timeToArrival < fastestTimeToArrival)
      fastestTimeToArrival = timeToArrival;
  });
  return {
    fastestTimeToArrival: isFinite(fastestTimeToArrival)
      ? fastestTimeToArrival
      : 99,
  };
}
