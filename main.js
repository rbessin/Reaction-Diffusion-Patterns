const GRID_SIZE = 512;
const WORKGROUP_SIZE = 8;
const SIMULATION_STEPS_PER_FRAME = 4;
const DIFFUSION_A = 1.0;
const DIFFUSION_B = 0.5;
const DELTA_TIME = 1.0;
const DEFAULT_FEED = 0.0367;
const DEFAULT_KILL = 0.0649;

const canvas = document.querySelector("canvas");
const feedRateInput = document.querySelector("#feed-rate");
const killRateInput = document.querySelector("#kill-rate");
const feedRateValue = document.querySelector("#feed-rate-value");
const killRateValue = document.querySelector("#kill-rate-value");
const resetButton = document.querySelector("#reset-pattern");
if (!navigator.gpu) {
  throw new Error("WebGPU is not supported on this browser.");
}
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error("Failed to get GPU adapter.");
}
const device = await adapter.requestDevice();

const context = canvas.getContext("webgpu");
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device,
  format: canvasFormat,
  alphaMode: "opaque",
});

const vertices = new Float32Array([
  // x,y pairs for two triangles that make up a square
  -1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1,
]);

const simulationSettings = new Float32Array([
  GRID_SIZE,
  GRID_SIZE,
  DEFAULT_FEED,
  DEFAULT_KILL,
  DIFFUSION_A,
  DIFFUSION_B,
  DELTA_TIME,
  0,
]);

const uniformBuffer = device.createBuffer({
  label: "Simulation Uniforms",
  size: simulationSettings.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(uniformBuffer, 0, simulationSettings);

const vertexBuffer = device.createBuffer({
  label: "Cell vertices",
  size: vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/ 0, vertices);

// Each cell stores the concentrations of chemicals A and B.
const cellStateArray = new Float32Array(GRID_SIZE * GRID_SIZE * 2);
const cellStateStorage = [
  device.createBuffer({
    label: "Cell State A",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  }),
  device.createBuffer({
    label: "Cell State B",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  }),
];

function seedPattern() {
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cellOffset = (y * GRID_SIZE + x) * 2;
      cellStateArray[cellOffset] = 1;
      cellStateArray[cellOffset + 1] = 0;
    }
  }

  const center = GRID_SIZE / 2;
  const seedRadius = Math.max(6, Math.floor(GRID_SIZE / 8));

  for (let y = center - seedRadius; y < center + seedRadius; y++) {
    for (let x = center - seedRadius; x < center + seedRadius; x++) {
      const jitteredB = 1.0;
      const cellOffset = (y * GRID_SIZE + x) * 2;
      cellStateArray[cellOffset] = 0.0;
      cellStateArray[cellOffset + 1] = jitteredB;
    }
  }

  device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);
  device.queue.writeBuffer(cellStateStorage[1], 0, cellStateArray);
}

seedPattern();

const shaderCode = await fetch("shaders/cell.wgsl").then((r) => r.text());
const cellShaderModule = device.createShaderModule({
  label: "Cell shader",
  code: shaderCode,
});

const computeShaderCode = await fetch("shaders/compute.wgsl").then((r) =>
  r.text(),
);
const computeShaderModule = device.createShaderModule({
  label: "Compute shader",
  code: computeShaderCode,
});

const vertexBufferLayout = {
  arrayStride: 8,
  attributes: [
    {
      format: "float32x2",
      offset: 0,
      shaderLocation: 0, // Position, see vertex shader
    },
  ],
};

const bindGroupLayout = device.createBindGroupLayout({
  label: "Cell Bind Group Layout",
  entries: [
    {
      binding: 0,
      // Add GPUShaderStage.FRAGMENT here if you are using the `grid` uniform in the fragment shader.
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
      buffer: {}, // Grid uniform buffer
    },
    {
      binding: 1,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
      buffer: { type: "read-only-storage" }, // Cell state input buffer
    },
    {
      binding: 2,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "storage" }, // Cell state output buffer
    },
  ],
});

const pipelineLayout = device.createPipelineLayout({
  label: "Cell Pipeline Layout",
  bindGroupLayouts: [bindGroupLayout],
});

const cellPipeline = device.createRenderPipeline({
  label: "Cell pipeline",
  layout: pipelineLayout,
  vertex: {
    module: cellShaderModule,
    entryPoint: "vertexMain",
    buffers: [vertexBufferLayout],
  },
  fragment: {
    module: cellShaderModule,
    entryPoint: "fragmentMain",
    targets: [
      {
        format: canvasFormat,
      },
    ],
  },
});

const bindGroups = [
  device.createBindGroup({
    label: "Cell renderer bind group A",
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
      {
        binding: 1,
        resource: { buffer: cellStateStorage[0] },
      },
      {
        binding: 2,
        resource: { buffer: cellStateStorage[1] },
      },
    ],
  }),
  device.createBindGroup({
    label: "Cell renderer bind group B",
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
      {
        binding: 1,
        resource: { buffer: cellStateStorage[1] },
      },
      {
        binding: 2,
        resource: { buffer: cellStateStorage[0] },
      },
    ],
  }),
];

const simulationPipeline = device.createComputePipeline({
  label: "Simulation pipeline",
  layout: pipelineLayout,
  compute: {
    module: computeShaderModule,
    entryPoint: "computeMain",
    constants: { WORKGROUP_SIZE },
  },
});

let step = 0;

function syncControls() {
  feedRateValue.textContent = Number(simulationSettings[2]).toFixed(4);
  killRateValue.textContent = Number(simulationSettings[3]).toFixed(4);
  device.queue.writeBuffer(uniformBuffer, 0, simulationSettings);
}

feedRateInput.addEventListener("input", (event) => {
  simulationSettings[2] = Number(event.target.value);
  syncControls();
});

killRateInput.addEventListener("input", (event) => {
  simulationSettings[3] = Number(event.target.value);
  syncControls();
});

resetButton.addEventListener("click", () => {
  step = 0;
  seedPattern();
});

syncControls();

function updateGrid() {
  const encoder = device.createCommandEncoder();
  const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);

  for (let i = 0; i < SIMULATION_STEPS_PER_FRAME; i++) {
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(simulationPipeline);
    computePass.setBindGroup(0, bindGroups[step % 2]);
    computePass.dispatchWorkgroups(workgroupCount, workgroupCount);
    computePass.end();
    step++;
  }

  // Start a render pass
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        loadOp: "clear",
        clearValue: { r: 0, g: 0, b: 0, a: 1.0 },
        storeOp: "store",
      },
    ],
  });

  // Draw the grid
  pass.setPipeline(cellPipeline);
  pass.setBindGroup(0, bindGroups[step % 2]);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE);

  // End the render pass and submit the command buffer
  pass.end();
  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(updateGrid);
}

requestAnimationFrame(updateGrid);
