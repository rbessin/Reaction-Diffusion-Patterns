export default {
  id: "fitzhugh-nagumo",
  name: "Fitzhugh-Nagumo",
  shaderUrl: "shaders/compute-fn.wgsl",
  Da: 1.0,   // Dv
  Db: 0.1,   // Dw
  dt: 0.2,
  stepsPerFrame: 4,
  displayMin: -1.5,
  displayMax: 1.5,
  params: [
    { id: "eps", label: "ε (time scale)", min: 0.01, max: 0.2,  step: 0.005,  default: 0.08 },
    { id: "a",   label: "a",              min: 0.5,  max: 1.5,  step: 0.01,   default: 0.7  },
    { id: "b",   label: "b",              min: 0.5,  max: 1.0,  step: 0.01,   default: 0.8  },
    { id: "I",   label: "I (stimulus)",   min: 0.0,  max: 0.5,  step: 0.005,  default: 0.0  },
  ],
  seed(grid, size, _params) {
    // Random initial state spanning the full dynamic range triggers
    // immediate self-organization into spiral waves and travelling pulses
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 2;
        grid[i]     = (Math.random() - 0.5) * 1.2;  // w ∈ [-0.6, 0.6]
        grid[i + 1] = (Math.random() - 0.5) * 3.0;  // v ∈ [-1.5, 1.5]
      }
    }
  },
};
