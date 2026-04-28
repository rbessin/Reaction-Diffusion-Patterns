struct SimulationUniforms {
  grid: vec2f,
  rates: vec2f,
  diffusion: vec2f,
  deltaTime: f32,
  padding: f32,
};

@group(0) @binding(0) var<uniform> uniforms: SimulationUniforms;
@group(0) @binding(1) var<storage, read> cellState: array<vec2f>;

struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) concentrationB: f32,
};

@vertex
fn vertexMain(
  @location(0) pos: vec2f,
  @builtin(instance_index) instance: u32) ->
  VertexOutput {

  let i = f32(instance);
  let cell = vec2f(i % uniforms.grid.x, floor(i / uniforms.grid.x));
  let state = cellState[instance];

  let cellOffset = cell / uniforms.grid * 2;
  let gridPos = (pos + 1) / uniforms.grid - 1 + cellOffset;

  var output: VertexOutput;
  output.pos = vec4f(gridPos, 0, 1);
  output.concentrationB = clamp(state.y, 0.0, 1.0);
  return output;
}

@fragment
fn fragmentMain(@location(0) concentrationB: f32) -> @location(0) vec4f {
  let b = clamp(concentrationB, 0.0, 1.0);
  let contrast = smoothstep(0.15, 0.85, b);
  let dark = vec3f(0.03, 0.05, 0.1);
  let light = vec3f(0.93, 0.95, 1.0);
  return vec4f(mix(dark, light, contrast), 1.0);
}
