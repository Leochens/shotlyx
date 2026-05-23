#![cfg(target_arch = "wasm32")]

use audio_analysis_core::{DetectSilenceOptions, SilenceSegment, detect_silence};
use js_sys::Float32Array;
use serde::{Deserialize, Serialize};
use wasm_bindgen::{JsValue, prelude::wasm_bindgen};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WasmDetectSilenceOptions {
    sample_rate: f32,
    threshold_db: f32,
    min_silence_ms: f32,
    padding_ms: f32,
    window_ms: f32,
    merge_gap_ms: f32,
}

impl From<WasmDetectSilenceOptions> for DetectSilenceOptions {
    fn from(options: WasmDetectSilenceOptions) -> Self {
        Self {
            sample_rate: options.sample_rate,
            threshold_db: options.threshold_db,
            min_silence_ms: options.min_silence_ms,
            padding_ms: options.padding_ms,
            window_ms: options.window_ms,
            merge_gap_ms: options.merge_gap_ms,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WasmSilenceSegment {
    start_sample: usize,
    end_sample: usize,
    start_seconds: f64,
    end_seconds: f64,
    duration_seconds: f64,
}

impl From<SilenceSegment> for WasmSilenceSegment {
    fn from(segment: SilenceSegment) -> Self {
        Self {
            start_sample: segment.start_sample,
            end_sample: segment.end_sample,
            start_seconds: segment.start_seconds,
            end_seconds: segment.end_seconds,
            duration_seconds: segment.duration_seconds,
        }
    }
}

#[wasm_bindgen(js_name = detectSilenceSegments)]
pub fn detect_silence_segments(
    samples: Float32Array,
    options: JsValue,
) -> Result<JsValue, JsValue> {
    let options: WasmDetectSilenceOptions =
        serde_wasm_bindgen::from_value(options).map_err(|error| {
            JsValue::from_str(&format!("invalid silence detection options: {error}"))
        })?;

    let mut pcm = vec![0.0; samples.length() as usize];
    samples.copy_to(&mut pcm);

    let segments =
        detect_silence(&pcm, options.into()).map_err(|error| JsValue::from_str(&error))?;
    let segments: Vec<WasmSilenceSegment> =
        segments.into_iter().map(WasmSilenceSegment::from).collect();

    serde_wasm_bindgen::to_value(&segments).map_err(|error| {
        JsValue::from_str(&format!("failed to serialize silence segments: {error}"))
    })
}
