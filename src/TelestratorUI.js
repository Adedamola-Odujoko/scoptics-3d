// src/TelestratorUI.js (FINAL VERSION WITH UNDO/ERASE)

export function createTelestratorUI({
  onToolSelect,
  onColorSelect,
  onClear,
  onUndo,
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

  const createColorSwatch = (color) => {
    const swatch = document.createElement("div");
    swatch.style.width = "24px";
    swatch.style.height = "24px";
    swatch.style.background = color;
    swatch.style.borderRadius = "50%";
    swatch.style.border = "2px solid #fff";
    swatch.style.cursor = "pointer";
    swatch.onclick = () => onColorSelect(color);
    toolbar.appendChild(swatch);
  };

  // --- Create Tools ---
  const cursorBtn = createButton("cursor", "Cursor");
  createButton("line", "Line");
  createButton("freehand", "Draw");
  createButton("erase", "Erase"); // <-- NEW ERASE TOOL

  // --- Create Actions ---
  const undoBtn = createButton("undo", "Undo Last", false); // false = not a selectable tool
  undoBtn.onclick = onUndo; // <-- NEW UNDO ACTION

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
