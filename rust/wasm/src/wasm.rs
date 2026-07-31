// SPDX-FileCopyrightText: 2025-2026 OpenCut
// SPDX-FileCopyrightText: 2026 GuanTou Lab and Shotlyx contributors
// SPDX-License-Identifier: GPL-3.0-only
//
// Portions of this file are derived from OpenCut, originally licensed under the MIT License.
// See licenses/OpenCut-MIT.txt for the original license notice.

#[cfg(target_arch = "wasm32")]
mod audio_analysis;
#[cfg(target_arch = "wasm32")]
mod compositor;
#[cfg(target_arch = "wasm32")]
mod effects;
#[cfg(target_arch = "wasm32")]
mod gpu;
#[cfg(target_arch = "wasm32")]
mod masks;
#[cfg(target_arch = "wasm32")]
mod perf;

#[cfg(target_arch = "wasm32")]
pub use audio_analysis::*;
#[cfg(target_arch = "wasm32")]
pub use compositor::*;
#[cfg(target_arch = "wasm32")]
pub use effects::*;
#[cfg(target_arch = "wasm32")]
pub use gpu::*;
#[cfg(target_arch = "wasm32")]
pub use masks::*;
#[cfg(target_arch = "wasm32")]
pub use perf::*;
pub use time::*;
