import { describe, expect, it } from 'vitest';
import { placeLabel, type Frame, type Rect } from '@/experience/world/label';

/** A desktop frame, with the real bar and flight-strip heights. */
const desktop: Frame = { width: 1440, height: 860, bar: 72, hud: 60 };
/** The small laptop the failing measurement was taken on. */
const laptop: Frame = { width: 1024, height: 700, bar: 72, hud: 60 };

/** The copy column: left-hand side, roughly half the height, as the acts lay it out. */
const copyIn = (f: Frame): Rect => ({ left: 48, right: 520, top: f.height * 0.33, bottom: f.height * 0.86 });

const W = 150;
const H = 16;

/** Follow the leader line from where CSS hangs it and see where it ends up. */
const reaches = (p: ReturnType<typeof placeLabel>, h: number) => {
  const rad = (p.lean * Math.PI) / 180;
  // 'top' stands up from the label's top edge; the others hang down
  if (p.from === 'top') return { x: p.x + p.lead * Math.sin(rad), y: p.y - h - p.lead * Math.cos(rad) };
  return { x: p.x - p.lead * Math.sin(rad), y: p.y + p.lead * Math.cos(rad) };
};

describe('label placement', () => {
  it('hangs a label straight above a point in open air', () => {
    const p = placeLabel(900, 500, W, H, desktop, copyIn(desktop), 1);
    expect(p.fade).toBe(1);
    expect(p.lean).toBeCloseTo(0, 6);
    expect(p.x).toBe(900);
    expect(p.y).toBe(500 - 26);
  });

  it('raises a label clear of the copy when there is headroom', () => {
    const copy = copyIn(desktop);
    // a point low down, over the copy, with the whole upper frame free
    const p = placeLabel(300, 700, W, H, desktop, copy, 1);
    expect(p.fade).toBe(1);
    expect(p.y).toBeLessThan(copy.top);
    expect(p.lean).toBeCloseTo(0, 6);
  });

  it('recovers the measured failure instead of fading it out', () => {
    // env:simulator projected to sx=110 sy=249 on a 1024x700 frame, landing on
    // the copy; it used to be left there at fade 0.02
    const copy = copyIn(laptop);
    const p = placeLabel(110, 249, W, H, laptop, copy, 1);
    expect(p.fade).toBe(1);
    expect(p.y).toBeLessThan(copy.top);
  });

  it('steps a label aside when it is over the copy with no room above', () => {
    // a copy block that reaches almost to the bar leaves nowhere to raise it
    const copy: Rect = { left: 48, right: 520, top: 120, bottom: 640 };
    const p = placeLabel(300, 400, W, H, laptop, copy, 1);
    expect(p.fade).toBe(1);
    expect(p.x - W / 2).toBeGreaterThan(copy.right);
    expect(Math.abs(p.lean)).toBeGreaterThan(10);
  });

  it('annotates a point near the top of the frame from below', () => {
    const p = placeLabel(700, 90, W, H, desktop, null, 1);
    expect(p.fade).toBe(1);
    // below its point, so the line stands up from the label's top edge rather
    // than sweeping back across its own text
    expect(p.y - H).toBeGreaterThan(90);
    expect(p.from).toBe('top');
    expect(p.lean).toBeCloseTo(0, 6);
  });

  it('raises a point near the flight strip clear of it', () => {
    const p = placeLabel(900, 850, W, H, desktop, null, 1);
    expect(p.fade).toBe(1);
    expect(p.y).toBeLessThanOrEqual(desktop.height - desktop.hud - 28);
  });

  it('keeps the leader line pointing at the point, however it was moved', () => {
    const copy = copyIn(laptop);
    for (let sx = 0; sx <= laptop.width; sx += 37) {
      for (let sy = 0; sy <= laptop.height; sy += 29) {
        for (const centred of [false, true]) {
          const p = placeLabel(sx, sy, W, H, laptop, copy, 1, centred);
          if (p.lead === 0) continue;
          const end = reaches(p, H);
          expect(end.x, `x at ${sx},${sy} centred=${centred}`).toBeCloseTo(sx, 6);
          expect(end.y, `y at ${sx},${sy} centred=${centred}`).toBeCloseTo(sy, 6);
        }
      }
    }
  });

  it('moves a numbered dot off the copy rather than hiding it', () => {
    const copy = copyIn(laptop);
    // trust:1 projected into the middle of the copy and was faded to nothing
    const p = placeLabel(401, 390, 30, 30, laptop, copy, 1, true);
    expect(p.fade).toBe(1);
    expect(p.lead).toBeGreaterThan(0);
    expect(p.from).toBe('center');
    const end = reaches(p, 30);
    expect(end.x).toBeCloseTo(401, 6);
    expect(end.y).toBeCloseTo(390, 6);
  });

  it('leaves a dot sitting on its point when nothing is in the way', () => {
    const p = placeLabel(800, 300, 30, 30, laptop, copyIn(laptop), 1, true);
    expect(p.x).toBe(800);
    expect(p.y).toBe(300);
    expect(p.lead).toBe(0);
    expect(p.fade).toBe(1);
  });

  it('never leaves a label sitting on the copy at a readable opacity', () => {
    const copy = copyIn(laptop);
    for (let sx = 0; sx <= laptop.width; sx += 20) {
      for (let sy = 0; sy <= laptop.height; sy += 20) {
        const p = placeLabel(sx, sy, W, H, laptop, copy, 1);
        if (p.fade < 0.05) continue;
        const box = { left: p.x - W / 2, right: p.x + W / 2, top: p.y - H, bottom: p.y };
        const clash = box.right > copy.left && box.left < copy.right && box.bottom > copy.top && box.top < copy.bottom;
        expect(clash, `label at ${sx},${sy} sits on the copy at fade ${p.fade}`).toBe(false);
      }
    }
  });

  it('fades a point that has gone behind the lens', () => {
    expect(placeLabel(700, 400, W, H, desktop, null, 0).fade).toBe(0);
  });

  it('leaves the route dots pinned on their point', () => {
    const p = placeLabel(700, 400, 30, 30, desktop, null, 1, true);
    expect(p.x).toBe(700);
    expect(p.y).toBe(400);
    expect(p.lead).toBe(0);
  });

  it('never leaves a dot sitting on the copy at a readable opacity', () => {
    const copy = copyIn(laptop);
    for (let sx = 0; sx <= laptop.width; sx += 20) {
      for (let sy = 0; sy <= laptop.height; sy += 20) {
        const p = placeLabel(sx, sy, 30, 30, laptop, copy, 1, true);
        if (p.fade < 0.05) continue;
        const box = { left: p.x - 15, right: p.x + 15, top: p.y - 15, bottom: p.y + 15 };
        const clash = box.right > copy.left && box.left < copy.right && box.bottom > copy.top && box.top < copy.bottom;
        expect(clash, `dot at ${sx},${sy} sits on the copy at fade ${p.fade}`).toBe(false);
      }
    }
  });
});
