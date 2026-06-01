use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::BlendMode;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameDescriptor {
    pub width: u32,
    pub height: u32,
    pub clear: CanvasClearDescriptor,
    pub items: Vec<FrameItemDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasClearDescriptor {
    pub color: [f32; 4],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum FrameItemDescriptor {
    Layer(LayerDescriptor),
    #[serde(rename_all = "camelCase")]
    SceneEffect {
        effect_pass_groups: Vec<Vec<EffectPassDescriptor>>,
        #[serde(default)]
        transform: Option<QuadTransformDescriptor>,
        #[serde(default)]
        shape: SceneEffectShape,
    },
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SceneEffectShape {
    #[default]
    Rect,
    Circle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerDescriptor {
    pub texture_id: String,
    pub transform: QuadTransformDescriptor,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    #[serde(default)]
    pub effect_pass_groups: Vec<Vec<EffectPassDescriptor>>,
    pub mask: Option<LayerMaskDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuadTransformDescriptor {
    pub center_x: f32,
    pub center_y: f32,
    pub width: f32,
    pub height: f32,
    pub rotation_degrees: f32,
    pub flip_x: bool,
    pub flip_y: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerMaskDescriptor {
    pub texture_id: String,
    pub feather: f32,
    pub inverted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectPassDescriptor {
    pub shader: String,
    pub uniforms: HashMap<String, EffectUniformValueDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum EffectUniformValueDescriptor {
    Number(f32),
    Vector(Vec<f32>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasTextureDescriptor {
    pub id: String,
    pub width: u32,
    pub height: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_scene_effect_descriptor_from_frontend_shape() {
        let descriptor = serde_json::json!({
            "width": 1920,
            "height": 1080,
            "clear": {
                "color": [0.0, 0.0, 0.0, 1.0]
            },
            "items": [
                {
                    "type": "sceneEffect",
                    "effectPassGroups": [
                        [
                            {
                                "shader": "pixelate",
                                "uniforms": {
                                    "u_blockSize": 32.0
                                }
                            }
                        ]
                    ],
                    "transform": {
                        "centerX": 1080.0,
                        "centerY": 500.0,
                        "width": 480.0,
                        "height": 216.0,
                        "rotationDegrees": 15.0,
                        "flipX": false,
                        "flipY": false
                    }
                }
            ]
        });

        let frame: FrameDescriptor =
            serde_json::from_value(descriptor).expect("descriptor should deserialize");

        let FrameItemDescriptor::SceneEffect {
            effect_pass_groups,
            transform,
            shape,
        } = &frame.items[0]
        else {
            panic!("expected scene effect item");
        };

        assert_eq!(*shape, SceneEffectShape::Rect);
        assert_eq!(effect_pass_groups[0][0].shader, "pixelate");
        assert!(matches!(
            effect_pass_groups[0][0].uniforms.get("u_blockSize"),
            Some(EffectUniformValueDescriptor::Number(value)) if (*value - 32.0).abs() < f32::EPSILON
        ));
        assert_eq!(transform.as_ref().map(|value| value.center_x), Some(1080.0));
    }
}
