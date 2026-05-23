#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DetectSilenceOptions {
    pub sample_rate: f32,
    pub threshold_db: f32,
    pub min_silence_ms: f32,
    pub padding_ms: f32,
    pub window_ms: f32,
    pub merge_gap_ms: f32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SilenceSegment {
    pub start_sample: usize,
    pub end_sample: usize,
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub duration_seconds: f64,
}

pub fn detect_silence(
    samples: &[f32],
    options: DetectSilenceOptions,
) -> Result<Vec<SilenceSegment>, String> {
    validate_options(options)?;

    if samples.is_empty() {
        return Ok(Vec::new());
    }

    let window_samples = ms_to_samples(options.window_ms, options.sample_rate).max(1);
    let min_silence_samples = ms_to_samples_ceil(options.min_silence_ms, options.sample_rate);
    let padding_samples = ms_to_samples(options.padding_ms, options.sample_rate);
    let merge_gap_samples = ms_to_samples(options.merge_gap_ms, options.sample_rate);

    let mut ranges = detect_raw_silence_ranges(samples, window_samples, options.threshold_db);
    ranges = merge_close_ranges(ranges, merge_gap_samples);

    let mut segments = Vec::new();
    for (mut start_sample, mut end_sample) in ranges {
        start_sample = (start_sample + padding_samples).min(samples.len());
        end_sample = end_sample.saturating_sub(padding_samples);

        if end_sample <= start_sample {
            continue;
        }

        if end_sample - start_sample < min_silence_samples {
            continue;
        }

        segments.push(segment(start_sample, end_sample, options.sample_rate));
    }

    Ok(segments)
}

fn validate_options(options: DetectSilenceOptions) -> Result<(), String> {
    if !options.sample_rate.is_finite() || options.sample_rate <= 0.0 {
        return Err("sample_rate must be a positive finite number".to_string());
    }

    if !options.threshold_db.is_finite() {
        return Err("threshold_db must be finite".to_string());
    }

    if !options.min_silence_ms.is_finite() || options.min_silence_ms < 0.0 {
        return Err("min_silence_ms must be a finite non-negative number".to_string());
    }

    if !options.padding_ms.is_finite() || options.padding_ms < 0.0 {
        return Err("padding_ms must be a finite non-negative number".to_string());
    }

    if !options.window_ms.is_finite() || options.window_ms <= 0.0 {
        return Err("window_ms must be a positive finite number".to_string());
    }

    if !options.merge_gap_ms.is_finite() || options.merge_gap_ms < 0.0 {
        return Err("merge_gap_ms must be a finite non-negative number".to_string());
    }

    Ok(())
}

fn detect_raw_silence_ranges(
    samples: &[f32],
    window_samples: usize,
    threshold_db: f32,
) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let mut current_start = None;

    let mut start = 0;
    while start < samples.len() {
        let end = (start + window_samples).min(samples.len());
        let is_silent = window_dbfs(&samples[start..end]) <= threshold_db;

        match (current_start, is_silent) {
            (None, true) => current_start = Some(start),
            (Some(silence_start), false) => {
                ranges.push((silence_start, start));
                current_start = None;
            }
            _ => {}
        }

        start = end;
    }

    if let Some(silence_start) = current_start {
        ranges.push((silence_start, samples.len()));
    }

    ranges
}

fn merge_close_ranges(
    ranges: Vec<(usize, usize)>,
    merge_gap_samples: usize,
) -> Vec<(usize, usize)> {
    let mut merged: Vec<(usize, usize)> = Vec::new();

    for (start, end) in ranges {
        if let Some((_, last_end)) = merged.last_mut()
            && start.saturating_sub(*last_end) <= merge_gap_samples
        {
            *last_end = end;
            continue;
        }

        merged.push((start, end));
    }

    merged
}

fn window_dbfs(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return f32::NEG_INFINITY;
    }

    let sum_squares: f64 = samples
        .iter()
        .map(|sample| {
            let sample = if sample.is_finite() { *sample } else { 0.0 };
            let sample = sample as f64;
            sample * sample
        })
        .sum();
    let rms = (sum_squares / samples.len() as f64).sqrt();

    if rms <= 0.0 {
        f32::NEG_INFINITY
    } else {
        (20.0 * rms.log10()) as f32
    }
}

fn segment(start_sample: usize, end_sample: usize, sample_rate: f32) -> SilenceSegment {
    let start_seconds = start_sample as f64 / sample_rate as f64;
    let end_seconds = end_sample as f64 / sample_rate as f64;

    SilenceSegment {
        start_sample,
        end_sample,
        start_seconds,
        end_seconds,
        duration_seconds: end_seconds - start_seconds,
    }
}

fn ms_to_samples(ms: f32, sample_rate: f32) -> usize {
    ((ms as f64 / 1_000.0) * sample_rate as f64).round() as usize
}

fn ms_to_samples_ceil(ms: f32, sample_rate: f32) -> usize {
    ((ms as f64 / 1_000.0) * sample_rate as f64).ceil() as usize
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options() -> DetectSilenceOptions {
        DetectSilenceOptions {
            sample_rate: 1_000.0,
            threshold_db: -40.0,
            min_silence_ms: 100.0,
            padding_ms: 0.0,
            window_ms: 10.0,
            merge_gap_ms: 0.0,
        }
    }

    fn samples(amplitude: f32, len: usize) -> Vec<f32> {
        vec![amplitude; len]
    }

    #[test]
    fn detects_pure_silence_as_one_segment() {
        let result = detect_silence(&samples(0.0, 1_000), options()).unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].start_sample, 0);
        assert_eq!(result[0].end_sample, 1_000);
        assert!((result[0].duration_seconds - 1.0).abs() < 0.000_001);
    }

    #[test]
    fn ignores_pure_sound() {
        let result = detect_silence(&samples(0.5, 1_000), options()).unwrap();

        assert!(result.is_empty());
    }

    #[test]
    fn detects_silence_between_two_sound_regions() {
        let mut input = samples(0.5, 200);
        input.extend(samples(0.0, 300));
        input.extend(samples(0.5, 200));

        let result = detect_silence(&input, options()).unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].start_sample, 200);
        assert_eq!(result[0].end_sample, 500);
    }

    #[test]
    fn ignores_silence_shorter_than_min_duration() {
        let mut input = samples(0.5, 200);
        input.extend(samples(0.0, 50));
        input.extend(samples(0.5, 200));

        let result = detect_silence(&input, options()).unwrap();

        assert!(result.is_empty());
    }

    #[test]
    fn applies_padding_and_merges_short_sound_gaps() {
        let mut input = samples(0.5, 200);
        input.extend(samples(0.0, 150));
        input.extend(samples(0.5, 40));
        input.extend(samples(0.0, 150));
        input.extend(samples(0.5, 200));

        let result = detect_silence(
            &input,
            DetectSilenceOptions {
                padding_ms: 20.0,
                merge_gap_ms: 50.0,
                ..options()
            },
        )
        .unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].start_sample, 220);
        assert_eq!(result[0].end_sample, 520);
    }

    #[test]
    fn rejects_invalid_options() {
        let result = detect_silence(
            &samples(0.0, 100),
            DetectSilenceOptions {
                sample_rate: 0.0,
                ..options()
            },
        );

        assert!(result.is_err());
    }

    #[test]
    fn empty_input_returns_no_segments() {
        let result = detect_silence(&[], options()).unwrap();

        assert!(result.is_empty());
    }
}
