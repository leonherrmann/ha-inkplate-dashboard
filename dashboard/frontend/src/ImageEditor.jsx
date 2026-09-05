import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DITHERS, dither, levels } from "./dither.js";

// Framing, levels and a live 1-bit preview, for a photo on its way to the panel.
//
// The window is fixed at the target size and the photo moves behind it, rather
// than a crop rectangle dragged over the whole picture. The target is always
// known here -- it is a grid cell, or the panel -- so the question is never
// "what shape do I want" but "what part of this do I want in that shape", and
// this is the arrangement that asks it.
//
// Everything geometric happens in this file: orientation, rotation, crop,
// scaling and levels. What gets uploaded is the greyscale result at its final
// size, and the backend only dithers and packs it. That split is deliberate --
// see the note in backend/images.py convert_prepared().

// How much bigger than the window the photo may be zoomed. Beyond this a
// 12-megapixel phone photo is being cropped to a few hundred pixels and the
// result is mush, but it is occasionally what you want for a detail.
const MAX_ZOOM = 8;

const ROTATIONS = [0, 90, 180, 270];

// The greyscale a photograph becomes before dithering. PIL's own coefficients,
// so a picture put through the editor looks like one put through the plain
// photo path rather than subtly different.
function luma(r, g, b) {
  return Math.round((r * 299 + g * 587 + b * 114) / 1000);
}

// The smallest zoom at which the photo still covers the window. Panning is
// clamped to this, so there is never a strip of blank paper down one edge --
// which on a 1-bit panel reads as a broken image rather than a choice.
function coverScale(bitmapWidth, bitmapHeight, width, height) {
  return Math.max(width / bitmapWidth, height / bitmapHeight);
}

export default function ImageEditor({ file, target, ditherName, brightness, contrast, onReady }) {
  const [bitmap, setBitmap] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [problem, setProblem] = useState("");
  const previewRef = useRef(null);
  const dragging = useRef(null);

  // Decoded with the orientation applied, which is the whole of the phone-photo
  // fix on this side: a picture taken in portrait records that in EXIF and is
  // stored landscape, and canvas drawImage does not apply it. Where the option
  // is not supported the picture simply arrives the way it was stored and the
  // rotate buttons put it right -- the preview shows which, so this can fail
  // visibly rather than silently.
  useEffect(() => {
    let live = true;
    if (!file) {
      setBitmap(null);
      return undefined;
    }
    setProblem("");
    createImageBitmap(file, { imageOrientation: "from-image" })
      .catch(() => createImageBitmap(file))
      .then((decoded) => {
        if (!live) return;
        setBitmap(decoded);
        setRotation(0);
        setFlipped(false);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      })
      .catch(() => live && setProblem("That file could not be decoded as an image."));
    return () => {
      live = false;
    };
  }, [file]);

  // The photo's size after rotation, which is what the window sees
  const rotated = useMemo(() => {
    if (!bitmap) return null;
    const swap = rotation === 90 || rotation === 270;
    return {
      width: swap ? bitmap.height : bitmap.width,
      height: swap ? bitmap.width : bitmap.height,
    };
  }, [bitmap, rotation]);

  const baseScale = rotated
    ? coverScale(rotated.width, rotated.height, target.width, target.height)
    : 1;

  // Draws the photo into a canvas of exactly the target size and returns the
  // greyscale bytes. The one place the geometry is decided, used by both the
  // preview and the upload so they cannot disagree.
  const renderGray = useCallback(() => {
    if (!bitmap || !rotated) return null;

    const { width, height } = target;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    // White, so a photo that somehow fails to cover reads as paper rather than
    // as the black a fresh canvas would dither to
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    const scale = baseScale * zoom;
    context.save();
    context.translate(width / 2 + offset.x, height / 2 + offset.y);
    context.rotate((rotation * Math.PI) / 180);
    context.scale(flipped ? -scale : scale, scale);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    context.restore();

    const pixels = context.getImageData(0, 0, width, height).data;
    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0; i < gray.length; i += 1) {
      gray[i] = luma(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]);
    }
    return levels(gray, brightness, contrast);
  }, [bitmap, rotated, target, baseScale, zoom, offset, rotation, flipped, brightness, contrast]);

  // The live preview: the real dither, over the real pixels, at the real size.
  useEffect(() => {
    const gray = renderGray();
    const canvas = previewRef.current;
    if (!gray || !canvas) return;

    const { width, height } = target;
    canvas.width = width;
    canvas.height = height;
    const bits = dither(gray, width, height, ditherName);

    const context = canvas.getContext("2d");
    const out = context.createImageData(width, height);
    for (let i = 0; i < bits.length; i += 1) {
      const value = bits[i];
      out.data[i * 4] = value;
      out.data[i * 4 + 1] = value;
      out.data[i * 4 + 2] = value;
      out.data[i * 4 + 3] = 255;
    }
    context.putImageData(out, 0, 0);
  }, [renderGray, target, ditherName]);

  // Hands the parent a way to produce the upload. A function rather than the
  // bytes themselves, so a drag does not re-encode a PNG on every frame.
  useEffect(() => {
    if (!onReady) return;
    onReady(
      bitmap
        ? async () => {
            const gray = renderGray();
            if (!gray) return null;
            const { width, height } = target;
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            const out = context.createImageData(width, height);
            for (let i = 0; i < gray.length; i += 1) {
              // R=G=B, so the backend's convert("L") is the identity on it and
              // the pixels it dithers are exactly the ones previewed here
              out.data[i * 4] = gray[i];
              out.data[i * 4 + 1] = gray[i];
              out.data[i * 4 + 2] = gray[i];
              out.data[i * 4 + 3] = 255;
            }
            context.putImageData(out, 0, 0);
            return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
          }
        : null,
    );
  }, [onReady, bitmap, renderGray, target]);

  // Panning, clamped so the photo always covers the window
  const clamp = useCallback(
    (next, atZoom) => {
      if (!rotated) return next;
      const scale = baseScale * atZoom;
      const slackX = Math.max(0, (rotated.width * scale - target.width) / 2);
      const slackY = Math.max(0, (rotated.height * scale - target.height) / 2);
      return {
        x: Math.min(slackX, Math.max(-slackX, next.x)),
        y: Math.min(slackY, Math.max(-slackY, next.y)),
      };
    },
    [rotated, baseScale, target],
  );

  useEffect(() => setOffset((current) => clamp(current, zoom)), [clamp, zoom]);

  const onPointerDown = (event) => {
    if (!bitmap) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = { x: event.clientX, y: event.clientY, from: offset };
  };

  const onPointerMove = (event) => {
    const drag = dragging.current;
    if (!drag) return;
    // The preview is shown at some CSS size; a pointer moved by one screen
    // pixel has to move the photo by one *target* pixel or dragging feels
    // geared wrong on a small window.
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = target.width / rect.width;
    setOffset(
      clamp(
        {
          x: drag.from.x + (event.clientX - drag.x) * ratio,
          y: drag.from.y + (event.clientY - drag.y) * ratio,
        },
        zoom,
      ),
    );
  };

  const endDrag = (event) => {
    dragging.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const turn = (degrees) => {
    setRotation((current) => ROTATIONS[(ROTATIONS.indexOf(current) + degrees + 4) % 4]);
    setOffset({ x: 0, y: 0 });
  };

  if (problem) return <p className="hint error">{problem}</p>;
  if (!bitmap) return null;

  return (
    <div className="image-editor">
      <div
        className="editor-stage"
        style={{ aspectRatio: `${target.width} / ${target.height}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <canvas
          ref={previewRef}
          className="editor-preview"
          aria-label="Preview of what the panel will show"
        />
      </div>

      <p className="hint">
        Drag to move the photo. {target.width}×{target.height} px, dithered exactly
        as the panel will draw it.
      </p>

      <div className="editor-controls">
        <label>
          <span>Zoom</span>
          <input
            type="range"
            min="1"
            max={MAX_ZOOM * 100}
            value={Math.round(zoom * 100)}
            onChange={(event) => setZoom(Math.max(1, Number(event.target.value) / 100))}
          />
        </label>

        <div className="editor-buttons">
          <button type="button" className="chip" onClick={() => turn(-1)}>
            Rotate left
          </button>
          <button type="button" className="chip" onClick={() => turn(1)}>
            Rotate right
          </button>
          <button
            type="button"
            className={flipped ? "chip active" : "chip"}
            onClick={() => setFlipped((current) => !current)}
          >
            Mirror
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => {
              setZoom(1);
              setOffset({ x: 0, y: 0 });
              setRotation(0);
              setFlipped(false);
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
