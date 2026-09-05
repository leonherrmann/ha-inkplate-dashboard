// Greyscale to 1-bit, mirroring backend/images.py pixel for pixel.
//
// This exists so the crop editor can show a live 1-bit preview while you drag,
// rather than making you upload to find out what the panel will do with a
// photograph. That preview is only worth having if it is exactly right, so
// these are not "a dither like the server's" -- they are the same algorithms,
// walking a flat Float64Array in raster order, with the same neighbour offsets
// and the same arithmetic in the same order. Both sides are IEEE doubles, so
// the outputs are identical rather than merely similar.
//
// tools/dithercheck.py asserts that on real images and fails the build if the
// two ever drift. Anything added here has to be added there and in images.py.

function diffuse(gray, width, height, taps, divisor) {
  // Float64Array, because the Python side accumulates error in floats and a
  // Uint8 or Int32 buffer here would round at every tap and slowly diverge.
  const pixels = Float64Array.from(gray);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const old = pixels[index];
      const now = old >= 128 ? 255 : 0;
      pixels[index] = now;
      const error = old - now;
      if (error === 0) continue;

      for (let t = 0; t < taps.length; t += 1) {
        const dx = taps[t][0];
        const dy = taps[t][1];
        const weight = taps[t][2];
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          pixels[ny * width + nx] += (error * weight) / divisor;
        }
      }
    }
  }

  const out = new Uint8ClampedArray(width * height);
  for (let i = 0; i < out.length; i += 1) out[i] = pixels[i] >= 128 ? 255 : 0;
  return out;
}

// (+1,0) (+2,0) (-1,+1) (0,+1) (+1,+1) (0,+2), a eighth of the error each.
// Only 3/4 of the error is propagated at all, which is what clips highlights
// and shadows to solid black and white and makes it read on e-ink.
const ATKINSON = [
  [1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1],
];

const FLOYD_STEINBERG = [
  [1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1],
];

export const DITHERS = {
  atkinson: {
    label: "Atkinson",
    hint: "Best for photographs. Clips to solid black and white.",
    apply: (gray, w, h) => diffuse(gray, w, h, ATKINSON, 8),
  },
  floyd_steinberg: {
    label: "Floyd–Steinberg",
    hint: "Keeps more midtone detail, muddier extremes.",
    apply: (gray, w, h) => diffuse(gray, w, h, FLOYD_STEINBERG, 16),
  },
  threshold: {
    label: "No dither",
    hint: "For logos and line art. A dither turns flat areas to noise.",
    apply: (gray, w, h) => {
      const out = new Uint8ClampedArray(w * h);
      for (let i = 0; i < out.length; i += 1) out[i] = gray[i] >= 128 ? 255 : 0;
      return out;
    },
  },
};

export const dither = (gray, width, height, name) =>
  (DITHERS[name] || DITHERS.atkinson).apply(gray, width, height);

// Brightness and contrast, applied before the dither and mirrored in images.py's
// docstring only -- the browser owns this step, because it owns the geometry.
//
// Contrast pivots about mid-grey so it opens the range out rather than
// darkening as it steepens. Both are in [-100, 100] with 0 meaning untouched.
export function levels(gray, brightness, contrast) {
  if (brightness === 0 && contrast === 0) return gray;

  // The usual GIMP-style curve. At +100 it is a steep S; at -100 everything
  // collapses toward mid-grey, which on a 1-bit panel means "mostly noise" --
  // useful to see, so it is not clamped away.
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i += 1) {
    const shifted = gray[i] + brightness * 1.28;
    out[i] = factor * (shifted - 128) + 128;
  }
  return out;
}
