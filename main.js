import * as engine from "./engine.js";
import grayScott from "./models/gray-scott.js";

const canvas = document.querySelector("canvas");
const modelSelect = document.querySelector("#model-select");
const paramsContainer = document.querySelector("#params");
const resetButton = document.querySelector("#reset-pattern");

const models = [grayScott];

function buildParamControls(model) {
  paramsContainer.innerHTML = "";
  for (const param of model.params) {
    const row = document.createElement("div");
    row.className = "control-row";
    row.innerHTML = `
      <label class="control-label" for="param-${param.id}">
        <span>${param.label}</span>
        <span id="param-${param.id}-value">${param.default.toFixed(4)}</span>
      </label>
      <input id="param-${param.id}" type="range"
        min="${param.min}" max="${param.max}" step="${param.step}" value="${param.default}" />
    `;
    row.querySelector("input").addEventListener("input", (e) => {
      const value = Number(e.target.value);
      document.querySelector(`#param-${param.id}-value`).textContent = value.toFixed(4);
      engine.updateParam(param.id, value);
    });
    paramsContainer.appendChild(row);
  }
}

// Populate dropdown from models array
for (const model of models) {
  const option = document.createElement("option");
  option.value = model.id;
  option.textContent = model.name;
  modelSelect.appendChild(option);
}

modelSelect.addEventListener("change", (e) => {
  engine.switchModel(e.target.value);
});

resetButton.addEventListener("click", () => engine.reset());

await engine.init(canvas, models, buildParamControls);
