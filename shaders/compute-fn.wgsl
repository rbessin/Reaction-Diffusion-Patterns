// Fitzhugh-Nagumo excitable media model
// Stored as vec2f(w, v) so v (activator) is the display variable (second component)
// p0=eps, p1=a, p2=b, p3=I  |  Da=Dv=1.0, Db=Dw=0.1

struct SimulationUniforms {
  grid: vec2f,
  Dv: f32,
  Dw: f32,
  eps: f32,
  a: f32,
  b: f32,
  I: f32,
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
  let current = stateAt(x, y); // current.x = w, current.y = v
  let w = current.x;
  let v = current.y;
  let lap = laplacian(x, y); // lap.x = ∇²w, lap.y = ∇²v

  let dv = uniforms.Dv * lap.y + v - (v * v * v) / 3.0 - w + uniforms.I;
  let dw = uniforms.Dw * lap.x + uniforms.eps * (v + uniforms.a - uniforms.b * w);

  let nextV = clamp(v + dv * uniforms.dt, -2.5, 2.5);
  let nextW = clamp(w + dw * uniforms.dt, -2.5, 2.5);

  cellStateOut[index] = vec2f(nextW, nextV); // store (w, v) — v is second component
}
