const GRID_SIZE = 512;
const WORKGROUP_SIZE = 8;

let device, context, format;
let cellBuffers, uniformBuffer, vertexBuffer;
let renderPipeline;
let computePipelines = {};
let bindGroupLayout, pipelineLayout;
let bindGroups = [null, null];
let step = 0;
let activeModel = null;
let currentParams = {};
let registry = {};
let onModelSwitch = null;

export async function init(canvas, modelArray, onSwitch) {
  if (!navigator.gpu) throw new Error("WebGPU not supported on this browser.");
  onModelSwitch = onSwitch;

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter found.");
  device = await adapter.requestDevice();

  context = canvas.getContext("webgpu");
  format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });

  // Vertex buffer: two triangles forming a unit quad
  const vertices = new Float32Array([-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1]);
  vertexBuffer = device.createBuffer({
    label: "Quad vertices",
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertices);

  // Double-buffered cell storage (512×512 cells × vec2f)
  const cellBufSize = GRID_SIZE * GRID_SIZE * 2 * Float32Array.BYTES_PER_ELEMENT;
  cellBuffers = [
    device.createBuffer({ label: "Cell state A", size: cellBufSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }),
    device.createBuffer({ label: "Cell state B", size: cellBufSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }),
  ];

  // Uniform buffer: 12 floats = 48 bytes
  uniformBuffer = device.createBuffer({
    label: "Simulation uniforms",
    size: 12 * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Shared bind group layout — binding 0 visible to FRAGMENT so cell.wgsl
  // can read displayMin/displayMax
  bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
        buffer: {},
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
    ],
  });
  pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

  // Render pipeline (shared across all models)
  const cellCode = await fetch("shaders/cell.wgsl").then(r => r.text());
  const cellModule = device.createShaderModule({ code: cellCode });
  renderPipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: cellModule,
      entryPoint: "vertexMain",
      buffers: [{
        arrayStride: 8,
        attributes: [{ format: "float32x2", offset: 0, shaderLocation: 0 }],
      }],
    },
    fragment: {
      module: cellModule,
      entryPoint: "fragmentMain",
      targets: [{ format }],
    },
  });

  for (const model of modelArray) {
    registry[model.id] = model;
  }

  await switchModel(modelArray[0].id);
  requestAnimationFrame(_loop);
}

export async function switchModel(modelId) {
  activeModel = registry[modelId];
  currentParams = Object.fromEntries(activeModel.params.map(p => [p.id, p.default]));

  if (!computePipelines[modelId]) {
    const requestedId = modelId;
    const r = await fetch(activeModel.shaderUrl);
    if (!r.ok) throw new Error(`Failed to load shader: ${activeModel.shaderUrl}`);
    const code = await r.text();
    if (activeModel.id !== requestedId) return; // superseded by a later switch
    const module = device.createShaderModule({ code });
    computePipelines[modelId] = device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module, entryPoint: "computeMain" },
    });
  }

  step = 0;
  _writeUniforms();
  _resetBuffers();
  _rebuildBindGroups();
  onModelSwitch?.(activeModel);
}

export function updateParam(paramId, value) {
  currentParams[paramId] = value;
  _writeUniforms();
}

export function reset() {
  step = 0;
  _resetBuffers();
  _writeUniforms();
}

// Uniform buffer layout (12 floats = 48 bytes):
// [0,1] grid x,y   [2] Da   [3] Db
// [4-7] model params (p0-p3)
// [8] displayMin   [9] displayMax   [10] dt   [11] padding
function _writeUniforms() {
  const data = new Float32Array(12);
  data[0]  = GRID_SIZE;
  data[1]  = GRID_SIZE;
  data[2]  = activeModel.Da;
  data[3]  = activeModel.Db;
  activeModel.params.forEach((p, i) => { data[4 + i] = currentParams[p.id]; });
  data[8]  = activeModel.displayMin;
  data[9]  = activeModel.displayMax;
  data[10] = activeModel.dt;
  data[11] = 0;
  device.queue.writeBuffer(uniformBuffer, 0, data);
}

function _resetBuffers() {
  const grid = new Float32Array(GRID_SIZE * GRID_SIZE * 2);
  activeModel.seed(grid, GRID_SIZE, currentParams);
  device.queue.writeBuffer(cellBuffers[0], 0, grid);
  device.queue.writeBuffer(cellBuffers[1], 0, grid);
}

function _rebuildBindGroups() {
  for (let i = 0; i < 2; i++) {
    bindGroups[i] = device.createBindGroup({
      label: `Bind group ${i === 0 ? "A" : "B"}`,
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: cellBuffers[i] } },
        { binding: 2, resource: { buffer: cellBuffers[1 - i] } },
      ],
    });
  }
}

function _loop() {
  const encoder = device.createCommandEncoder();
  const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
  const stepsPerFrame = activeModel.stepsPerFrame ?? 4;

  for (let i = 0; i < stepsPerFrame; i++) {
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(computePipelines[activeModel.id]);
    computePass.setBindGroup(0, bindGroups[step % 2]);
    computePass.dispatchWorkgroups(workgroupCount, workgroupCount);
    computePass.end();
    step++;
  }

  const renderPass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      loadOp: "clear",
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      storeOp: "store",
    }],
  });
  renderPass.setPipeline(renderPipeline);
  renderPass.setBindGroup(0, bindGroups[step % 2]);
  renderPass.setVertexBuffer(0, vertexBuffer);
  renderPass.draw(6, GRID_SIZE * GRID_SIZE);
  renderPass.end();

  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(_loop);
}
