import { describe, expect, it } from 'vitest';
import { compactOps, fitGallery, isFill, type DrawOp, type StrokeSegment } from '../game/drawOps';

/** A stroke of `points` points along a line, as the client sends it: a dot, then segments. */
function stroke(strokeId: string, points: number, color = '#000000'): StrokeSegment[] {
  const at = (i: number) => ({ x: i / points, y: 0.5 });
  return Array.from({ length: points }, (_, i) => ({
    strokeId,
    from: i === 0 ? null : at(i - 1),
    to: at(i),
    color,
    size: 8,
  }));
}

describe('compactOps', () => {
  it('returns small drawings unchanged', () => {
    const ops = stroke('a', 10);
    expect(compactOps(ops, 100)).toEqual(ops);
  });

  it('thins strokes to fit, keeping each stroke connected and its end points', () => {
    const ops: DrawOp[] = [
      ...stroke('a', 500),
      { type: 'fill', strokeId: 'f', x: 0.5, y: 0.5, color: '#ff0000' },
      ...stroke('b', 500, '#00ff00'),
    ];
    const out = compactOps(ops, 200);
    expect(out.length).toBeLessThanOrEqual(200);

    // The fill stays between the two strokes.
    const fillIndex = out.findIndex(isFill);
    expect(out.slice(0, fillIndex).every((op) => !isFill(op) && op.strokeId === 'a')).toBe(true);
    expect(out.slice(fillIndex + 1).every((op) => !isFill(op) && op.strokeId === 'b')).toBe(true);

    for (const id of ['a', 'b']) {
      const segments = out.filter((op): op is StrokeSegment => !isFill(op) && op.strokeId === id);
      const original = ops.filter((op): op is StrokeSegment => !isFill(op) && op.strokeId === id);
      expect(segments[0].from).toBeNull();
      expect(segments[0].to).toEqual(original[0].to);
      expect(segments[segments.length - 1].to).toEqual(original[original.length - 1].to);
      // Every segment starts where the previous one ended.
      for (let i = 1; i < segments.length; i++) expect(segments[i].from).toEqual(segments[i - 1].to);
    }
  });

  it('still fits the budget when there are many tiny strokes', () => {
    const ops = Array.from({ length: 300 }, (_, i) => stroke(`s${i}`, 3)).flat();
    expect(compactOps(ops, 100).length).toBeLessThanOrEqual(100);
  });
});

describe('fitGallery', () => {
  it('shares the total budget between drawings', () => {
    const entries = [1, 2, 3, 4].map((n) => ({ drawerName: `P${n}`, word: 'cat', ops: stroke(`s${n}`, 1000) }));
    const fitted = fitGallery(entries, 1000);
    expect(fitted).toHaveLength(4);
    expect(fitted.reduce((sum, entry) => sum + entry.ops.length, 0)).toBeLessThanOrEqual(1000);
    expect(fitted[0]).toMatchObject({ drawerName: 'P1', word: 'cat' });
  });
});
