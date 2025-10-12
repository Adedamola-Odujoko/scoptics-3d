import { Vector3 } from "three";
import {
  findClosestPlayer,
  isPointInTriangle,
  getPassingCone,
} from "./utils.js";

export function calculateLs(
  lq,
  carrier,
  defenders,
  otherAttackers,
  goal,
  attackingDirection
) {
  const threatPotentialScore = calculateThreatPotential(
    lq,
    goal,
    defenders,
    otherAttackers,
    attackingDirection
  );
  const exploitationScore = calculateExploitationScore(
    lq,
    defenders,
    otherAttackers
  );
  const feasibilityScore = calculateFeasibilityScore(lq, carrier, defenders);
  const ALPHA = 0.4,
    BASE = 0.5,
    SCALE = 0.5,
    K = 7.0;
  const situationValue =
    ALPHA * (threatPotentialScore * exploitationScore) +
    (1 - ALPHA) * ((threatPotentialScore + exploitationScore) / 2);
  const raw_ls = situationValue * (BASE + SCALE * feasibilityScore);
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
  return Math.min(1.0, isFinite(potential) ? potential : 0);
}

function calculateStrategicBonus(
  lq,
  goal,
  defenders,
  otherAttackers,
  attackingDirection
) {
  console.log(
    `--- STRATEGIC BONUS (v-FINAL) --- Received attacking direction: ${attackingDirection}`
  );

  if (
    defenders.length === 0 ||
    otherAttackers.length === 0 ||
    !attackingDirection
  ) {
    console.log("Exit: Missing players or attacking direction.");
    return 0.0;
  }

  // --- THIS IS THE FINAL LOGIC FIX ---
  // The "last defender" is the outfield player deepest in their own half (closest to their own goal).
  let lastDefender = null;
  let offsideLineX;

  if (attackingDirection < 0) {
    // Attacking LEFT (-X). Defenders are defending the LEFT goal.
    // We need the defender with the MINIMUM X-coordinate (closest to the -52.5 goal).
    offsideLineX = Infinity;
    for (const def of defenders) {
      if (def.playerData.role !== "GK" && def.mesh.position.x < offsideLineX) {
        offsideLineX = def.mesh.position.x;
        lastDefender = def;
      }
    }
  } else {
    // Attacking RIGHT (+X). Defenders are defending the RIGHT goal.
    // We need the defender with the MAXIMUM X-coordinate (closest to the +52.5 goal).
    offsideLineX = -Infinity;
    for (const def of defenders) {
      if (def.playerData.role !== "GK" && def.mesh.position.x > offsideLineX) {
        offsideLineX = def.mesh.position.x;
        lastDefender = def;
      }
    }
  }
  // --- END OF FINAL LOGIC FIX ---

  if (!lastDefender) {
    console.log("Exit: Could not identify a last defender (outfield player).");
    return 0.0;
  }

  console.log(
    `Last Defender Found (Deepest Player): ${
      lastDefender.playerData.name
    } at x=${offsideLineX.toFixed(2)}`
  );

  // 3. Check if the LQ is behind the line
  let isBehindLine;
  if (attackingDirection < 0) {
    // Attacking left
    isBehindLine = lq.center.x < offsideLineX;
  } else {
    // Attacking right
    isBehindLine = lq.center.x > offsideLineX;
  }

  if (!isBehindLine) {
    console.log(
      `Exit: LQ is NOT behind the line. LQ Center X: ${lq.center.x.toFixed(
        2
      )}, Last Defender X: ${offsideLineX.toFixed(2)}`
    );
    return 0.0;
  }

  console.log(`Condition MET: LQ is behind the defensive line.`);

  // 4. Verify attacker advantage (unchanged)
  const { fastestTimeToArrival: attTimeToLq } = calculateTeamControlMetrics(
    lq.center,
    otherAttackers
  );
  const { fastestTimeToArrival: defTimeToLq } = calculateTeamControlMetrics(
    lq.center,
    defenders
  );

  if (defTimeToLq <= attTimeToLq) {
    console.log(
      `Exit: Defender can recover faster. Def_TTA: ${defTimeToLq.toFixed(
        1
      )}s, Att_TTA: ${attTimeToLq.toFixed(1)}s`
    );
    return 0.0;
  }

  console.log(`Condition MET: Attacker has recovery advantage.`);

  // 5. Calculate bonus (unchanged)
  const runway = lq.center.distanceTo(goal.position);
  const bonus = 0.85 * (1 / (1 + Math.exp(-0.15 * (runway - 35))));

  console.log(`SUCCESS! Strategic Bonus calculated: ${bonus.toFixed(2)}`);
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
