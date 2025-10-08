// FILE: src/DataExporterUI.js

// This will hold all the accepted data entries in memory
let collectedEntries = [];
// This holds the single entry that is awaiting user confirmation
let stagedEntry = null;

/**
 * Creates the main container, table, and export button on the screen.
 */
export function createDataExporterUI() {
  const container = document.createElement("div");
  container.id = "data-exporter-container";
  container.style.position = "absolute";
  container.style.bottom = "80px";
  container.style.left = "14px";
  container.style.width = "400px";
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
  header.style.borderTopLeftRadius = "8px";
  header.style.borderTopRightRadius = "8px";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";

  const title = document.createElement("h4");
  title.innerText = "Collected Leakage Data";
  title.style.margin = "0";

  const exportButton = document.createElement("button");
  exportButton.innerText = "Export to CSV";
  exportButton.style.padding = "4px 8px";
  exportButton.style.border = "1px solid #555";
  exportButton.style.background = "#2a2a2a";
  exportButton.style.color = "#ddd";
  exportButton.style.borderRadius = "4px";
  exportButton.style.cursor = "pointer";

  header.appendChild(title);
  header.appendChild(exportButton);

  const tableContainer = document.createElement("div");
  tableContainer.style.overflowY = "auto";
  tableContainer.style.padding = "0 12px 12px 12px";

  const table = document.createElement("table");
  table.id = "data-table";
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const headers = ["Timestamp", "LQ Area", "LS", "Interceptors", "Def. Width"];
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
  stagingDataCell.colSpan = "3";
  stagingDataCell.id = "staging-data";
  stagingDataCell.style.padding = "4px";

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

/**
 * Displays a potential entry in the staging area for confirmation.
 * @param {object} entry - The data object to be staged.
 */
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

/**
 * Clears the staging area and discards the staged entry.
 */
function clearStagingArea() {
  stagedEntry = null;
  const stagingRow = document.getElementById("staging-row");
  if (stagingRow) {
    stagingRow.style.display = "none";
  }
}

/**
 * Adds an accepted entry to the main data array and the on-screen table.
 * @param {object} entry - The full data object for the new entry.
 */
function addEntryToTable(entry) {
  collectedEntries.push(entry);

  const tbody = document.getElementById("data-table-body");
  if (!tbody) return;

  const row = document.createElement("tr");

  const timestamp = (entry.timestamp / 1000).toFixed(1) + "s";
  const lqArea = entry.lq_area.toFixed(1);
  const ls = entry.ls_heuristic.toFixed(2);
  const interceptors = entry.path_num_interceptors;
  const defWidth = entry.def_line_width.toFixed(1);

  [timestamp, lqArea, ls, interceptors, defWidth].forEach((text) => {
    const td = document.createElement("td");
    td.innerText = text;
    td.style.padding = "4px";
    td.style.borderBottom = "1px solid #333";
    row.appendChild(td);
  });

  tbody.appendChild(row);
  tbody.parentElement.parentElement.scrollTop =
    tbody.parentElement.parentElement.scrollHeight;
}

/**
 * Converts the collected data to a CSV string and triggers a download.
 */
function exportToCsv() {
  if (collectedEntries.length === 0) {
    alert("No data collected yet!");
    return;
  }

  const headers = Object.keys(collectedEntries[0]);
  const csvRows = [headers.join(",")];

  for (const entry of collectedEntries) {
    const values = headers.map((header) => {
      const value = entry[header];
      if (typeof value === "string" && value.includes(",")) {
        return `"${value}"`;
      }
      return value;
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
