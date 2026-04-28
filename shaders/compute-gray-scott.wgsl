struct SimulationUniforms {
  grid: vec2f,
  Da: f32,
  Db: f32,
  feedRate: f32,
  killRate: f32,
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

fn concentrationAt(x: i32, y: i32) -> vec2f {
  let wrapped = vec2u(
    wrapCoord(x, i32(uniforms.grid.x)),
    wrapCoord(y, i32(uniforms.grid.y)),
  );
  return cellStateIn[cellIndex(wrapped)];
}

fn laplacian(x: i32, y: i32) -> vec2f {
  let center = concentrationAt(x, y);
  return concentrationAt(x - 1, y) * 0.2 +
         concentrationAt(x + 1, y) * 0.2 +
         concentrationAt(x, y - 1) * 0.2 +
         concentrationAt(x, y + 1) * 0.2 +
         concentrationAt(x - 1, y - 1) * 0.05 +
         concentrationAt(x + 1, y - 1) * 0.05 +
         concentrationAt(x - 1, y + 1) * 0.05 +
         concentrationAt(x + 1, y + 1) * 0.05 -
         center;
}

@compute @workgroup_size(8, 8)
fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
  if (cell.x >= u32(uniforms.grid.x) || cell.y >= u32(uniforms.grid.y)) { return; }

  let x = i32(cell.x);
  let y = i32(cell.y);
  let index = cellIndex(cell.xy);
  let current = concentrationAt(x, y);
  let diffusion = laplacian(x, y);

  let a = current.x;
  let b = current.y;
  let reaction = a * b * b;

  let nextA = a + (uniforms.Da * diffusion.x - reaction + uniforms.feedRate * (1.0 - a)) * uniforms.dt;
  let nextB = b + (uniforms.Db * diffusion.y + reaction - (uniforms.killRate + uniforms.feedRate) * b) * uniforms.dt;

  cellStateOut[index] = vec2f(clamp(nextA, 0.0, 1.0), clamp(nextB, 0.0, 1.0));
}
