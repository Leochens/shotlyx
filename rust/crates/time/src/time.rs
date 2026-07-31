// SPDX-FileCopyrightText: 2025-2026 OpenCut
// SPDX-FileCopyrightText: 2026 GuanTou Lab and Shotlyx contributors
// SPDX-License-Identifier: GPL-3.0-only
//
// Portions of this file are derived from OpenCut, originally licensed under the MIT License.
// See licenses/OpenCut-MIT.txt for the original license notice.

mod frame_rate;
mod media_time;
mod timecode;

pub use frame_rate::FrameRate;
pub use media_time::{
    FloorToFrameOptions, IsFrameAlignedOptions, LastFrameTimeOptions, MediaTime,
    MediaTimeAddOptions, MediaTimeClampOptions, MediaTimeFromFrameOptions,
    MediaTimeFromSecondsOptions, MediaTimeMaxOptions, MediaTimeMinOptions, MediaTimeSubOptions,
    MediaTimeToFrameOptions, MediaTimeToSecondsOptions, RoundToFrameOptions,
    SnappedSeekTimeOptions, TICKS_PER_SECOND, floor_to_frame, is_frame_aligned, last_frame_time,
    media_time_add, media_time_clamp, media_time_from_frame, media_time_from_seconds,
    media_time_max, media_time_min, media_time_sub, media_time_to_frame, media_time_to_seconds,
    round_to_frame, snapped_seek_time,
};
pub use timecode::{
    FormatTimecodeOptions, GuessTimecodeFormatOptions, ParseTimecodeOptions, TimeCodeFormat,
    format_timecode, guess_timecode_format, parse_timecode,
};
