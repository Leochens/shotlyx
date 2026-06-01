struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

struct EffectUniforms {
    resolution: vec2f,
    direction: vec2f,
    scalars: vec4f,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: EffectUniforms;

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let zoom = max(uniforms.scalars.x, 1.0);
    let center = uniforms.direction;
    let pixel_coord = input.tex_coord * uniforms.resolution;
    let sample_pixel = center + (pixel_coord - center) / zoom;
    let sample_coord = clamp(sample_pixel / uniforms.resolution, vec2f(0.0), vec2f(1.0));

    return textureSample(input_texture, input_sampler, sample_coord);
}
