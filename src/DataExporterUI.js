import { Vector3 } from "three";
import { calculateLs } from "./LsCalculator.js";
import { calculateGlobalFeatures } from "./FeatureCalculator.js";
import { calculatePolygonArea } from "./utils.js";

let collectedEntries = [];
let stagedPacket = null;

export function createDataExporterUI() {
  const container = document.createElement("div");
  container.id = "data-exporter-container";
  container.style.position = "absolute";
  container.style.bottom = "80px";
  container.style.left = "14px";
  container.style.width = "550px";
  container.style.maxHeight = "40vh";
  container.style.background = "rgba(0,0,0,0.6)";
  container.style.borderRadius = "8px";
  container.style.zIndex = "998";
  container.style.color = "#ddd";
  container.style.fontFamily = "sans-serif";
  container.style.fontSize = "11px";
  container.style.display = "flex";
  container.style.flexDirection = "column";

  const header = document.createElement("div");
  header.style.padding = "8px 12px";
  header.style.background = "rgba(0,0,0,0.5)";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  const title = document.createElement("h4");
  title.innerText = "Collected Leakage Data (Summary)";
  title.style.margin = "0";
  const exportButton = document.createElement("button");
  exportButton.innerText = "Export Full JSONL";
  exportButton.style.padding = "4px 8px";
  exportButton.style.border = "1px solid #555";
  exportButton.style.background = "#2a2a2a";
  exportButton.style.color = "#ddd";
  exportButton.style.borderRadius = "4px";
  exportButton.style.cursor = "pointer";
  header.appendChild(title);
  header.appendChild(exportButton);

  const tableContainer = document.createElement("div");
  tableContainer.style.overflow = "auto";
  tableContainer.style.padding = "0 12px 12px 12px";
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const headers = [
    "Time",
    "LS",
    "Threat",
    "Exploit",
    "Feasy",
    "LQ Ctr X",
    "LQ Ctr Z",
  ];
  headers.forEach((text) => {
    const th = document.createElement("th");
    th.innerText = text;
    th.style.textAlign = "left";
    th.style.padding = "4px";
    th.style.borderBottom = "1px solid #555";
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const tbody = document.createElement("tbody");
  tbody.id = "data-table-body";
  const tfoot = document.createElement("tfoot");
  const stagingRow = document.createElement("tr");
  stagingRow.id = "staging-row";
  stagingRow.style.display = "none";
  stagingRow.style.background = "rgba(80, 80, 0, 0.3)";
  const stagingDataCell = document.createElement("td");
  stagingDataCell.colSpan = "5";
  stagingDataCell.style.padding = "4px";
  stagingDataCell.innerText = "Staged event. Click Accept to process and save.";
  const stagingActionsCell = document.createElement("td");
  stagingActionsCell.colSpan = "2";
  stagingActionsCell.style.textAlign = "right";
  const acceptBtn = document.createElement("button");
  acceptBtn.innerText = "✔ Accept";
  acceptBtn.style.background = "#004d00";
  acceptBtn.style.color = "white";
  acceptBtn.style.border = "none";
  acceptBtn.style.padding = "4px 8px";
  acceptBtn.style.marginRight = "4px";
  acceptBtn.style.borderRadius = "4px";
  acceptBtn.style.cursor = "pointer";
  const rejectBtn = document.createElement("button");
  rejectBtn.innerText = "✖ Reject";
  rejectBtn.style.background = "#660000";
  rejectBtn.style.color = "white";
  rejectBtn.style.border = "none";
  rejectBtn.style.padding = "4px 8px";
  rejectBtn.style.borderRadius = "4px";
  rejectBtn.style.cursor = "pointer";
  stagingActionsCell.appendChild(acceptBtn);
  stagingActionsCell.appendChild(rejectBtn);
  stagingRow.appendChild(stagingDataCell);
  stagingRow.appendChild(stagingActionsCell);
  tfoot.appendChild(stagingRow);

  table.appendChild(thead);
  table.appendChild(tbody);
  table.appendChild(tfoot);
  tableContainer.appendChild(table);
  container.appendChild(header);
  container.appendChild(tableContainer);
  document.body.appendChild(container);

  exportButton.onclick = exportToJsonl;
  acceptBtn.onclick = () => {
    if (stagedPacket) {
      const finalDataObject = processStagedPacket(stagedPacket);
      if (finalDataObject) addEntryToTable(finalDataObject);
      clearStagingArea();
    }
  };
  rejectBtn.onclick = clearStagingArea;
}

export function stageEntry(fullDataPacket) {
  if (stagedPacket) clearStagingArea();
  stagedPacket = fullDataPacket;
  const stagingRow = document.getElementById("staging-row");
  if (stagingRow) stagingRow.style.display = "table-row";
}

function clearStagingArea() {
  stagedPacket = null;
  const stagingRow = document.getElementById("staging-row");
  if (stagingRow) stagingRow.style.display = "none";
}

function processStagedPacket(packet) {
  const {
    timestamp,
    lq_zone,
    playerManager,
    attackingTeamName,
    attackingDirection,
    goal,
  } = packet;

  const Y_OFFSET = 0.02;
  const center = lq_zone.position;
  const lqCorners = [
    new Vector3(
      center.x - lq_zone.scale.x / 2,
      Y_OFFSET,
      center.z - lq_zone.scale.y / 2
    ),
    new Vector3(
      center.x + lq_zone.scale.x / 2,
      Y_OFFSET,
      center.z - lq_zone.scale.y / 2
    ),
    new Vector3(
      center.x + lq_zone.scale.x / 2,
      Y_OFFSET,
      center.z + lq_zone.scale.y / 2
    ),
    new Vector3(
      center.x - lq_zone.scale.x / 2,
      Y_OFFSET,
      center.z + lq_zone.scale.y / 2
    ),
  ];
  const lq_object = {
    center: center.clone(),
    corners: lqCorners,
    area: calculatePolygonArea(lqCorners),
  };

  const carrier = playerManager.playerInPossession;
  const defenders = playerManager.getAllTeamPlayers(
    attackingTeamName === playerManager.metadata.home_team.name
      ? playerManager.metadata.away_team.name
      : playerManager.metadata.home_team.name
  );
  const attackers = playerManager.getAllTeamPlayers(attackingTeamName);

  const scores = calculateLs(
    lq_object,
    carrier,
    defenders,
    attackers,
    goal,
    attackingDirection
  );
  const globalFeatures = calculateGlobalFeatures(
    playerManager,
    attackingTeamName,
    attackingDirection
  );

  const finalDataObject = {
    metadata: {
      timestamp_ms: timestamp,
      attacking_team_name: attackingTeamName,
    },
    ground_truth_labels: {
      target_lq_box: {
        center_x: lq_object.center.x,
        center_z: lq_object.center.z,
        width: lq_zone.scale.x,
        height: lq_zone.scale.y,
      },
      target_ls_score: scores.final_ls,
    },
    input_features: {
      player_data: Array.from(playerManager.playerMap.values()).map((p) => ({
        id: p.playerData.id,
        team: p.playerData.team,
        role: p.playerData.role,
        x: p.mesh.position.x,
        z: p.mesh.position.z,
        vx: p.velocity.x,
        vz: p.velocity.z,
      })),
      global_feature_vector: globalFeatures,
      lq_specific_feature_vector: {
        final_threat_score: scores.threatPotentialScore,
        final_exploitation_score: scores.exploitationScore,
        final_feasibility_score: scores.feasibilityScore,

        threat_proximity: scores.details.threat.proximityThreat,
        threat_strategic: scores.details.threat.strategicThreat,
        threat_combined: scores.details.threat.combinedProximityScore,
        threat_angle_factor: scores.details.threat.goalAngleFactor,
        threat_area_amplifier: scores.details.threat.areaAmplifier,

        exploit_def_agg_prob: scores.details.exploit.defAggProb,
        exploit_def_fastest_tta: scores.details.exploit.defFastestTime,
        exploit_def_recovery_score: scores.details.exploit.defRecoveryScore,
        exploit_def_swarm_score: scores.details.exploit.defSwarmScore,
        exploit_def_control_score: scores.details.exploit.defensiveControl,
        exploit_att_agg_support: scores.details.exploit.aggAttSupport,
        exploit_att_fastest_tta: scores.details.exploit.attFastestTime,
        exploit_att_support_score: scores.details.exploit.attSupportScore,
        exploit_overload_factor: scores.details.exploit.overloadFactor,
        exploit_attacking_potential: scores.details.exploit.attackingPotential,
        exploit_speed_bonus: scores.details.exploit.speedBonus,

        feasy_pressure_on_carrier_dist: scores.details.feasy.pressureDist,
        feasy_pressure_factor: scores.details.feasy.pressureFactor,
        feasy_pass_dist_to_lq: carrier.mesh.position.distanceTo(
          lq_object.center
        ),
        feasy_pass_dist_factor: scores.details.feasy.passDistFactor,
        feasy_num_interceptors: scores.details.feasy.numInterceptors,
        feasy_obstruction_factor: scores.details.feasy.obstructionFactor,
      },
      raster_input_channels: {
        player_position_map_path: `data/positions/frame_${timestamp}.npy`,
        voronoi_freespace_map_path: `data/voronoi/frame_${timestamp}.npy`,
      },
    },
  };
  return finalDataObject;
}

function addEntryToTable(entry) {
  collectedEntries.push(entry);
  const tbody = document.getElementById("data-table-body");
  if (!tbody) return;
  const row = document.createElement("tr");
  const dataForTable = {
    time: (entry.metadata.timestamp_ms / 1000).toFixed(1) + "s",
    ls: entry.ground_truth_labels.target_ls_score.toFixed(2),
    threat:
      entry.input_features.lq_specific_feature_vector.final_threat_score.toFixed(
        2
      ),
    exploit:
      entry.input_features.lq_specific_feature_vector.final_exploitation_score.toFixed(
        2
      ),
    feasy:
      entry.input_features.lq_specific_feature_vector.final_feasibility_score.toFixed(
        2
      ),
    lq_x: entry.ground_truth_labels.target_lq_box.center_x.toFixed(1),
    lq_z: entry.ground_truth_labels.target_lq_box.center_z.toFixed(1),
  };
  Object.values(dataForTable).forEach((text) => {
    const td = document.createElement("td");
    td.innerText = text;
    td.style.padding = "4px";
    td.style.borderBottom = "1px solid #333";
    row.appendChild(td);
  });
  tbody.appendChild(row);
}

function exportToJsonl() {
  if (collectedEntries.length === 0) return;
  const jsonlString = collectedEntries
    .map((entry) => JSON.stringify(entry))
    .join("\n");
  const blob = new Blob([jsonlString], {
    type: "application/jsonl+json;charset=utf-8;",
  });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `mlds_data_${new Date().toISOString()}.jsonl`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
