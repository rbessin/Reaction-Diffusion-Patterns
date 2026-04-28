// Brusselator oscillating reaction model
// Stored as vec2f(u, v) — v is the display variable (second component)
// p0=A, p1=B  |  Da=Du=1.0, Db=Dv=8.0

struct SimulationUniforms {
  grid: vec2f,
  Du: f32,
  Dv: f32,
  A: f32,
  B: f32,
  p2: f32,
  p3: f32,
  displayMin: f32,
  displayMax: f32,
  dt: f32,
  _pad: f32,
}

@group(0) @binding(0) var<uniform> uniforms: SimulationUniforms;
@group(0) @binding(1) var<storage, read> cellStateIn: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> cellStateOut: array<vec2f>;

fn cellIndex(cell: vec2u) -> u32 {
  return (cell.y % u32(uniforms.grid.y)) * u32(uniforms.grid.x) +
         (cell.x % u32(uniforms.grid.x));
}

fn wrapCoord(value: i32, maxValue: i32) -> u32 {
  return u32((value % maxValue + maxValue) % maxValue);
}

fn stateAt(x: i32, y: i32) -> vec2f {
  let wrapped = vec2u(
    wrapCoord(x, i32(uniforms.grid.x)),
    wrapCoord(y, i32(uniforms.grid.y)),
  );
  return cellStateIn[cellIndex(wrapped)];
}

fn laplacian(x: i32, y: i32) -> vec2f {
  let center = stateAt(x, y);
  return stateAt(x - 1, y) * 0.2 +
         stateAt(x + 1, y) * 0.2 +
         stateAt(x, y - 1) * 0.2 +
         stateAt(x, y + 1) * 0.2 +
         stateAt(x - 1, y - 1) * 0.05 +
         stateAt(x + 1, y - 1) * 0.05 +
         stateAt(x - 1, y + 1) * 0.05 +
         stateAt(x + 1, y + 1) * 0.05 -
         center;
}

@compute @workgroup_size(8, 8)
fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
  if (cell.x >= u32(uniforms.grid.x) || cell.y >= u32(uniforms.grid.y)) { return; }

  let x = i32(cell.x);
  let y = i32(cell.y);
  let index = cellIndex(cell.xy);
  let current = stateAt(x, y);
  let u = current.x;
  let v = current.y;
  let lap = laplacian(x, y);
  let uv2 = u * u * v;

  let du = uniforms.Du * lap.x + uniforms.A - (uniforms.B + 1.0) * u + uv2;
  let dv = uniforms.Dv * lap.y + uniforms.B * u - uv2;

  let nextU = max(u + du * uniforms.dt, 0.0);
  let nextV = max(v + dv * uniforms.dt, 0.0);

  cellStateOut[index] = vec2f(nextU, nextV);
}
