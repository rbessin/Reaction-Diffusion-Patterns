struct SimulationUniforms {
  grid: vec2f,
  rates: vec2f,
  diffusion: vec2f,
  deltaTime: f32,
  padding: f32,
};

@group(0) @binding(0) var<uniform> uniforms: SimulationUniforms;
@group(0) @binding(1) var<storage, read> cellStateIn: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> cellStateOut: array<vec2f>;
override WORKGROUP_SIZE: u32 = 8;

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

@compute @workgroup_size(WORKGROUP_SIZE, WORKGROUP_SIZE)
fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
  if (cell.x >= u32(uniforms.grid.x) || cell.y >= u32(uniforms.grid.y)) {
    return;
  }

  let x = i32(cell.x);
  let y = i32(cell.y);
  let index = cellIndex(cell.xy);
  let current = concentrationAt(x, y);
  let diffusion = laplacian(x, y);

  let a = current.x;
  let b = current.y;
  let reaction = a * b * b;
  let feed = uniforms.rates.x;
  let kill = uniforms.rates.y;

  let nextA = a + (
    uniforms.diffusion.x * diffusion.x -
    reaction +
    feed * (1.0 - a)
  ) * uniforms.deltaTime;

  let nextB = b + (
    uniforms.diffusion.y * diffusion.y +
    reaction -
    (kill + feed) * b
  ) * uniforms.deltaTime;

  cellStateOut[index] = vec2f(
    clamp(nextA, 0.0, 1.0),
    clamp(nextB, 0.0, 1.0),
  );
}
