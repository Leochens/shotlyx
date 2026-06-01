struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

struct RegionMaskUniforms {
    resolution: vec2f,
    center: vec2f,
    size: vec2f,
    rotation_radians: f32,
    shape: f32,
    _padding: vec4f,
}

@group(0) @binding(0) var<uniform> uniforms: RegionMaskUniforms;

fn rotate_inverse(point: vec2f, angle: f32) -> vec2f {
    let c = cos(angle);
    let s = sin(angle);
    return vec2f(
        point.x * c + point.y * s,
        -point.x * s + point.y * c,
    );
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let pixel = input.tex_coord * uniforms.resolution;
    let local = rotate_inverse(pixel - uniforms.center, uniforms.rotation_radians);
    let half_size = max(uniforms.size * 0.5, vec2f(0.0001));
    let normalized = local / half_size;
    let in_rect = abs(normalized.x) <= 1.0 && abs(normalized.y) <= 1.0;
    let in_circle = length(normalized) <= 1.0;
    let is_circle = uniforms.shape > 0.5;
    let alpha = select(select(0.0, 1.0, in_rect), select(0.0, 1.0, in_circle), is_circle);
    return vec4f(1.0, 1.0, 1.0, alpha);
}
