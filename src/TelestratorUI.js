export function createTelestratorUI({
  onToolSelect,
  onColorSelect,
  onClear,
  onUndo,
  onConnectToggle, // <-- NEW callback
}) {
  const toolbar = document.createElement("div");
  toolbar.id = "telestrator-toolbar";
  toolbar.style.position = "absolute";
  toolbar.style.top = "14px";
  toolbar.style.right = "14px";
  toolbar.style.display = "flex";
  toolbar.style.flexDirection = "column";
  toolbar.style.gap = "8px";
  toolbar.style.padding = "8px";
  toolbar.style.background = "rgba(0,0,0,0.45)";
  toolbar.style.borderRadius = "8px";
  toolbar.style.zIndex = "999";

  let activeToolButton = null;

  const createButton = (id, text, isTool = true) => {
    const btn = document.createElement("button");
    btn.id = `tool-${id}`;
    btn.innerText = text;
    btn.style.padding = "6px";
    btn.style.border = "none";
    btn.style.background = "#222";
    btn.style.color = "#ddd";
    btn.style.borderRadius = "6px";
    btn.style.cursor = "pointer";

    if (isTool) {
      btn.onclick = () => {
        if (activeToolButton) activeToolButton.style.background = "#222";
        activeToolButton = btn;
        activeToolButton.style.background = "#0074d9";
        onToolSelect(id);
      };
    }

    toolbar.appendChild(btn);
    return btn;
  };

  const createSeparator = () => {
    const sep = document.createElement("div");
    sep.style.height = "1px";
    sep.style.background = "#444";
    sep.style.margin = "4px 0";
    toolbar.appendChild(sep);
  };

  // --- Create Tools ---
  const cursorBtn = createButton("cursor", "Cursor");
  createButton("line", "Line");
  createButton("arrow", "Arrow");
  createButton("freehand", "Draw");
  createSeparator();
  createButton("zone-box", "Zone (Box)");
  createButton("zone-circle", "Zone (Circle)");
  createSeparator();
  createButton("highlight", "Highlight Player");
  createButton("erase", "Erase");

  // --- NEW: Connect Mode Checkbox ---
  const connectContainer = document.createElement("label");
  connectContainer.style.display = "flex";
  connectContainer.style.alignItems = "center";
  connectContainer.style.gap = "6px";
  connectContainer.style.fontSize = "12px";
  connectContainer.style.color = "#ddd";
  connectContainer.style.padding = "4px";
  connectContainer.style.cursor = "pointer";

  const connectCheckbox = document.createElement("input");
  connectCheckbox.type = "checkbox";
  connectCheckbox.onchange = (e) => onConnectToggle(e.target.checked);

  connectContainer.appendChild(connectCheckbox);
  connectContainer.appendChild(document.createTextNode("Connect"));
  toolbar.appendChild(connectContainer);
  // --- END NEW ---

  // --- Create Actions ---
  const undoBtn = createButton("undo", "Undo Last", false);
  undoBtn.onclick = onUndo;

  const clearBtn = createButton("clear", "Clear All", false);
  clearBtn.onclick = onClear;

  // --- Create Colors ---
  const colorSection = document.createElement("div");
  colorSection.style.display = "flex";
  colorSection.style.gap = "6px";
  colorSection.style.justifyContent = "center";
  toolbar.appendChild(colorSection);

  ["#ffff00", "#ff4136", "#0074d9", "#ffffff"].forEach((c) => {
    const swatch = document.createElement("div");
    swatch.style.width = "20px";
    swatch.style.height = "20px";
    swatch.style.background = c;
    swatch.style.borderRadius = "50%";
    swatch.style.border = "2px solid #fff";
    swatch.style.cursor = "pointer";
    swatch.onclick = () => onColorSelect(c);
    colorSection.appendChild(swatch);
  });

  document.body.appendChild(toolbar);

  cursorBtn.click();
}
