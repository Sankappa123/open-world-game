// Rendering presets. Integrated GPUs (like Intel UHD) get 'medium'; it is fill-rate that hurts them, so the
// presets mostly trade internal resolution, shadow size and grass density.
export const PRESETS = {
  low:    { pr: 0.6,  prMin: 0.45, prMax: 0.75, shadow: 1024, shadowRange: 36, grass: 0.4, decor: 110, anisotropy: 2 },
  medium: { pr: 0.8,  prMin: 0.6,  prMax: 1.0,  shadow: 1536, shadowRange: 44, grass: 0.7, decor: 150, anisotropy: 4 },
  high:   { pr: 1.0,  prMin: 0.8,  prMax: 1.5,  shadow: 2048, shadowRange: 52, grass: 1.0, decor: 220, anisotropy: 8 },
};
let detected = null;                                 // read once: the GL string never changes, and a lost context reads as ''
export function detectQuality(renderer) {
  if (detected) return detected;
  return (detected = detectOnce(renderer));
}
function detectOnce(renderer) {
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    if (/swiftshader|llvmpipe|software/i.test(name)) return 'low';
    // Apple silicon (M1..M5 in any ANGLE/Metal string, e.g. 'ANGLE Metal Renderer: Apple M4') is an integrated GPU in
    // a thin, often fanless laptop: 'high' throttles it under sustained load, so it gets 'medium' like other iGPUs.
    if (/intel|mali|adreno|powervr|apple m\d|apple gpu|apple,|iris|uhd|hd graphics|radeon vega|radeon\(tm\) graphics/i.test(name)) return 'medium';
    return 'high';
  } catch { return 'medium'; }
}
