/**
 * Where a label goes once its point has been projected onto the screen.
 *
 * The rule is: move it, then fade it. A label is pulled off its point —
 * upwards, downwards, or to one side — until it is clear of the copy and of
 * the page chrome, and its leader line leans to keep pointing at the thing it
 * names. Only a label with nowhere left to go is faded out.
 *
 * Fading one that could simply have been moved is what made the labels in the
 * training-environment chapter unreadable: their points project onto the left
 * of the frame, which is exactly where the copy sits, and with the top bar
 * directly above there was no room to raise them. They were left sitting on
 * the words at two per cent opacity instead of being stepped to one side.
 *
 * Kept separate from the engine, and free of the DOM and of three.js, so the
 * geometry can be checked directly rather than inferred from a screenshot.
 */

export type Rect = { left: number; right: number; top: number; bottom: number };
export type Frame = {
  width: number;
  height: number;
  /** The bar across the top of the page. */
  bar: number;
  /** The flight strip along the bottom. */
  hud: number;
};
/** Which edge of the label the leader line hangs from. */
export type Lead = 'bottom' | 'top' | 'center';
export type Placement = {
  /** Where the label goes: its bottom centre, or its centre if it is a dot. */
  x: number;
  y: number;
  /** Length of the leader line, 0 when the label is sitting on its point. */
  lead: number;
  /** Which edge the line hangs from. */
  from: Lead;
  /** Its lean away from the line's own resting direction, in degrees. */
  lean: number;
  fade: number;
};

/** The shortest leader line that still reads as one. */
const GAP = 26;
/** How far a fade ramps over. */
const SOFT = 28;
/**
 * Clear air left around the copy — wider than the fade's own ramp, so a label
 * that has been successfully moved clear is at full opacity rather than at
 * nine tenths of it.
 */
const MARGIN = 18;

const smoothstep = (x: number, lo: number, hi: number) => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

const deg = (r: number) => (r * 180) / Math.PI;

const overlaps = (box: Rect, copy: Rect) =>
  box.right > copy.left - MARGIN &&
  box.left < copy.right + MARGIN &&
  box.bottom > copy.top - MARGIN &&
  box.top < copy.bottom + MARGIN;

/**
 * @param sx,sy   the point, in page pixels
 * @param w,h     the label's own size; `h` excludes the leader line
 * @param centred a label that sits on its point rather than hanging above it
 *                (the numbered dots), which only grows a line if it has to be
 *                moved off the point to stay readable
 */
export function placeLabel(
  sx: number,
  sy: number,
  w: number,
  h: number,
  frame: Frame,
  copy: Rect | null,
  depth: number,
  centred = false,
): Placement {
  const topLimit = frame.bar + SOFT;
  const bottomLimit = frame.height - frame.hud - SOFT;
  // how far the label's box sits above the placed point, and below it
  const over = centred ? h / 2 : h;
  const under = centred ? h / 2 : 0;

  let push = 0;
  let lift = centred ? 0 : GAP;
  const boxAt = (p: number, l: number): Rect => ({
    left: sx + p - w / 2,
    right: sx + p + w / 2,
    top: sy - l - over,
    bottom: sy - l + under,
  });

  if (copy && overlaps(boxAt(push, lift), copy)) {
    // First choice is to raise it: the line stays vertical and the label stays
    // over the thing it names.
    const needed = sy + under - copy.top + MARGIN;
    const headroom = sy - over - topLimit;
    if (needed <= headroom) {
      lift = Math.max(lift, needed);
    } else {
      // No room above, so step it aside instead, to whichever side it fits.
      const toRight = copy.right + MARGIN + 4 + w / 2 - sx;
      const toLeft = copy.left - MARGIN - 4 - w / 2 - sx;
      if (sx + toRight + w / 2 <= frame.width - MARGIN) push = toRight;
      else if (sx + toLeft - w / 2 >= MARGIN) push = toLeft;
      // and if neither side fits, it is genuinely stuck and will fade
    }
  }

  // Keep the whole label inside the band between the bar and the strip. A
  // point high in the frame is annotated from below, which is why the lift is
  // allowed to go negative — the leader line simply points the other way.
  let box = boxAt(push, lift);
  if (box.bottom > bottomLimit) lift += box.bottom - bottomLimit;
  box = boxAt(push, lift);
  if (box.top < topLimit) lift -= topLimit - box.top;

  box = boxAt(push, lift);
  const x = sx + push;
  const y = sy - lift;
  const moved = push !== 0 || lift !== (centred ? 0 : GAP) || !centred;

  // The line runs from whichever edge faces the point, so it never crosses the
  // label's own text on its way there.
  let from: Lead = centred ? 'center' : 'bottom';
  if (!centred && box.top > sy) from = 'top';
  const originY = from === 'top' ? y - h : y;
  const vx = sx - x;
  const vy = sy - originY;
  const lead = centred && !moved ? 0 : Math.hypot(vx, vy);
  // 'bottom' and 'center' hang downwards, 'top' stands upwards
  const lean = from === 'top' ? deg(Math.atan2(vx, -vy)) : deg(Math.atan2(-vx, vy));

  return { x, y, lead, from, lean, fade: fadeFor(box, frame, copy, depth, w, h) };
}

function fadeFor(box: Rect, frame: Frame, copy: Rect | null, depth: number, w: number, h: number) {
  let fade = Math.min(
    smoothstep(box.left, -w * 0.5, SOFT),
    smoothstep(frame.width - box.right, -w * 0.5, SOFT),
    smoothstep(box.top - frame.bar, -h * 0.6, SOFT),
    smoothstep(frame.height - frame.hud - box.bottom, -h * 0.6, SOFT),
    depth,
  );
  if (copy) {
    // The gap only has to read as a gap: a label clear of the copy by sixteen
    // pixels is clear of it, and holding it at half opacity for want of forty
    // is what made these hard to read at all.
    const clear = Math.max(copy.left - box.right, box.left - copy.right, copy.top - box.bottom, box.top - copy.bottom);
    fade = Math.min(fade, smoothstep(clear, -6, 16));
  }
  return fade;
}
