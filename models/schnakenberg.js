export default {
  id: "schnakenberg",
  name: "Schnakenberg",
  shaderUrl: "shaders/compute-schnaken.wgsl",
  Da: 1.0,    // Du
  Db: 40.0,   // Dv — large ratio drives Turing instability
  dt: 0.01,
  stepsPerFrame: 20,
  displayMin: 0.0,
  displayMax: 2.0,
  params: [
    { id: "a", label: "a", min: 0.05, max: 0.3, step: 0.005, default: 0.1 },
    { id: "b", label: "b", min: 0.4,  max: 1.2, step: 0.01,  default: 0.9 },
  ],
  seed(grid, size, params) {
    const uEq = params.a + params.b;
    const vEq = params.b / ((params.a + params.b) ** 2);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 2;
        grid[i]     = uEq + (Math.random() - 0.5) * 0.05;
        grid[i + 1] = vEq + (Math.random() - 0.5) * 0.05;
      }
    }
  },
};
