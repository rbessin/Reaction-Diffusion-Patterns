export default {
  id: "gray-scott",
  name: "Gray-Scott",
  shaderUrl: "shaders/compute-gray-scott.wgsl",
  Da: 1.0,
  Db: 0.5,
  dt: 1.0,
  stepsPerFrame: 4,
  displayMin: 0.15,
  displayMax: 0.85,
  params: [
    { id: "feedRate", label: "Feed Rate", min: 0.01, max: 0.09, step: 0.0005, default: 0.0367 },
    { id: "killRate", label: "Kill Rate", min: 0.03, max: 0.07, step: 0.0005, default: 0.0649 },
  ],
  seed(grid, size, _params) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 2;
        grid[i]     = 1.0;
        grid[i + 1] = 0.0;
      }
    }
    const center = size / 2;
    const radius = Math.max(6, Math.floor(size / 8));
    for (let y = center - radius; y < center + radius; y++) {
      for (let x = center - radius; x < center + radius; x++) {
        const i = (y * size + x) * 2;
        grid[i]     = 0.0;
        grid[i + 1] = 1.0;
      }
    }
  },
};
