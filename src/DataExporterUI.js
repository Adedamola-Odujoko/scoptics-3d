// FILE: src/DataExporterUI.js

let collectedEntries = [];
let stagedEntry = null;

/**
 * Creates the main container, table, and export button on the screen.
 */
export function createDataExporterUI() {
  const container = document.createElement("div");
  container.id = "data-exporter-container";
  // --- START: EXPAND THE UI TO BE WIDER ---
  container.style.position = "absolute";
  container.style.bottom = "80px";
  container.style.left = "14px";
  container.style.width = "550px"; // <-- Increased width
  container.style.maxHeight = "40vh";
  // ... (rest of container styling is the same)
  container.style.background = "rgba(0,0,0,0.6)";
  container.style.borderRadius = "8px";
  container.style.zIndex = "998";
  container.style.color = "#ddd";
  container.style.fontFamily = "sans-serif";
  container.style.fontSize = "11px";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  // --- END EXPAND ---

  const header = document.createElement("div");
  header.style.padding = "8px 12px";
  header.style.background = "rgba(0,0,0,0.5)";
  header.style.borderTopLeftRadius = "8px";
  header.style.borderTopRightRadius = "8px";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";

  const title = document.createElement("h4");
  title.innerText = "Collected Leakage Data (Summary)"; // <-- Updated title
  title.style.margin = "0";

  const exportButton = document.createElement("button");
  exportButton.innerText = "Export Full CSV"; // <-- Updated button text
  exportButton.style.padding = "4px 8px";
  exportButton.style.border = "1px solid #555";
  exportButton.style.background = "#2a2a2a";
  exportButton.style.color = "#ddd";
  exportButton.style.borderRadius = "4px";
  exportButton.style.cursor = "pointer";

  header.appendChild(title);
  header.appendChild(exportButton);

  const tableContainer = document.createElement("div");
  tableContainer.style.overflow = "auto"; // Allow horizontal scroll if needed
  tableContainer.style.padding = "0 12px 12px 12px";

  const table = document.createElement("table");
  table.id = "data-table";
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  // --- START: EXPANDED HEADERS ---
  const headers = [
    "Time",
    "LS",
    "LQ Area",
    "Int.",
    "Pressure",
    "Def. W",
    "LQ Ctr X",
    "LQ Ctr Z",
  ];
  // --- END EXPANDED HEADERS ---

  headers.forEach((text) => {
    const th = document.createElement("th");
    th.innerText = text;
    th.style.textAlign = "left";
    th.style.padding = "4px";
    th.style.borderBottom = "1px solid #555";
    th.style.whiteSpace = "nowrap";
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
  stagingDataCell.colSpan = "5"; // Adjusted colspan
  stagingDataCell.id = "staging-data";
  stagingDataCell.style.padding = "4px";

  const stagingActionsCell = document.createElement("td");
  stagingActionsCell.colSpan = "3"; // Adjusted colspan
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

  exportButton.onclick = exportToCsv;
  acceptBtn.onclick = () => {
    if (stagedEntry) {
      addEntryToTable(stagedEntry);
      clearStagingArea();
    }
  };
  rejectBtn.onclick = () => {
    clearStagingArea();
  };
}

export function stageEntry(entry) {
  if (stagedEntry) {
    clearStagingArea();
  }
  stagedEntry = entry;
  const stagingRow = document.getElementById("staging-row");
  const stagingDataCell = document.getElementById("staging-data");
  if (!stagingRow || !stagingDataCell) return;
  const timestamp = (entry.timestamp / 1000).toFixed(1) + "s";
  const ls = entry.ls_heuristic.toFixed(2);
  const interceptors = entry.path_num_interceptors;
  stagingDataCell.innerText = `Staged: ${timestamp} | LS: ${ls} | Int: ${interceptors}`;
  stagingRow.style.display = "table-row";
}

function clearStagingArea() {
  stagedEntry = null;
  const stagingRow = document.getElementById("staging-row");
  if (stagingRow) {
    stagingRow.style.display = "none";
  }
}

function addEntryToTable(entry) {
  collectedEntries.push(entry);
  const tbody = document.getElementById("data-table-body");
  if (!tbody) return;

  const row = document.createElement("tr");

  // --- START: EXPANDED DATA FOR DISPLAY ---
  const timestamp = (entry.timestamp / 1000).toFixed(1) + "s";
  const ls = entry.ls_heuristic.toFixed(2);
  const lqArea = entry.lq_area.toFixed(1);
  const interceptors = entry.path_num_interceptors;
  const pressure = entry.pressure_on_carrier_dist.toFixed(1);
  const defWidth = (entry.def_line_width || 0).toFixed(1);
  const lqCenterX = entry.lq_center_x.toFixed(1);
  const lqCenterZ = entry.lq_center_z.toFixed(1);

  [
    timestamp,
    ls,
    lqArea,
    interceptors,
    pressure,
    defWidth,
    lqCenterX,
    lqCenterZ,
  ].forEach((text) => {
    const td = document.createElement("td");
    td.innerText = text;
    td.style.padding = "4px";
    td.style.borderBottom = "1px solid #333";
    td.style.whiteSpace = "nowrap";
    row.appendChild(td);
  });
  // --- END EXPANDED DATA ---

  tbody.appendChild(row);
  tbody.parentElement.parentElement.scrollTop =
    tbody.parentElement.parentElement.scrollHeight;
}

function exportToCsv() {
  if (collectedEntries.length === 0) {
    alert("No data collected yet!");
    return;
  }

  // This is the key part: It gets ALL keys from the full data object.
  const headers = Object.keys(collectedEntries[0]);
  const csvRows = [headers.join(",")];

  for (const entry of collectedEntries) {
    // It then maps over ALL headers to get every single value.
    const values = headers.map((header) => {
      const value = entry[header];
      if (typeof value === "string" && value.includes(",")) {
        return `"${value}"`;
      }
      return value === null ? "" : value; // Handle null values
    });
    csvRows.push(values.join(","));
  }

  const csvString = csvRows.join("\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });

  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `leakage_data_${new Date().toISOString()}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
