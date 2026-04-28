export default {
  id: "brusselator",
  name: "Brusselator",
  shaderUrl: "shaders/compute-brus.wgsl",
  Da: 1.0,   // Du
  Db: 8.0,   // Dv
  dt: 0.02,
  stepsPerFrame: 10,
  displayMin: 0.5,
  displayMax: 4.0,
  params: [
    { id: "A", label: "A", min: 0.5, max: 3.0, step: 0.05, default: 2.0 },
    { id: "B", label: "B", min: 1.0, max: 6.0, step: 0.05, default: 4.5 },
  ],
  seed(grid, size, params) {
    const uEq = params.A;
    const vEq = params.B / params.A;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 2;
        grid[i]     = uEq + (Math.random() - 0.5) * 0.2;
        grid[i + 1] = vEq + (Math.random() - 0.5) * 0.2;
      }
    }
  },
};
