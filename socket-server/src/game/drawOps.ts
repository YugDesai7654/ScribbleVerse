/**
 * Drawing operations stored in a turn's history. Everything a client needs to
 * replay a canvas, in order: line segments and flood fills. Coordinates are
 * normalised to the canvas (0..1).
 */
export type Point = { x: number; y: number };

/** One line segment of a stroke. Has no `type` field, for compatibility with v1 clients. */
export type StrokeSegment = {
  strokeId: string;
  from: Point | null;
  to: Point;
  color: string;
  size: number;
};

/** A flood fill at a point. Clients replay it against whatever is on the canvas at that moment. */
export type FillOp = {
  type: 'fill';
  strokeId: string;
  x: number;
  y: number;
  color: string;
};

export type DrawOp = StrokeSegment | FillOp;

export function isFill(op: DrawOp): op is FillOp {
  return (op as FillOp).type === 'fill';
}

/** One finished drawing, kept for the end-of-game gallery. */
export type GalleryEntry = {
  drawerName: string;
  word: string;
  ops: DrawOp[];
};

/** Most operations kept for a single gallery drawing. */
export const GALLERY_OPS_PER_DRAWING = 1500;
/** Most operations sent in one `gameOver` gallery, across every drawing. */
export const GALLERY_TOTAL_OPS = 40_000;

/**
 * Rebuilds a stroke from every `step`-th point. The first and last points are
 * always kept, so the shape stays recognisable, just with straighter lines.
 */
function thinStroke(run: StrokeSegment[], step: number): StrokeSegment[] {
  if (run.length <= 2 || step <= 1) return run;
  const first = run[0];
  const kept: number[] = [];
  for (let i = 0; i < run.length; i += step) kept.push(i);
  if (kept[kept.length - 1] !== run.length - 1) kept.push(run.length - 1);

  const out: StrokeSegment[] = [{ ...first, from: null, to: first.from ?? first.to }];
  let previous = first.from ?? first.to;
  for (const index of kept) {
    const segment = run[index];
    if (index === 0 && segment.from === null) continue; // the opening dot is already in `out`
    out.push({ ...segment, from: previous, to: segment.to });
    previous = segment.to;
  }
  return out;
}

function compactWithStep(ops: readonly DrawOp[], step: number): DrawOp[] {
  const out: DrawOp[] = [];
  let run: StrokeSegment[] = [];
  const flush = () => {
    if (run.length) out.push(...thinStroke(run, step));
    run = [];
  };
  for (const op of ops) {
    if (isFill(op)) {
      flush();
      out.push(op);
    } else {
      if (run.length && run[0].strokeId !== op.strokeId) flush();
      run.push(op);
    }
  }
  flush();
  return out;
}

/**
 * Shrinks a drawing to at most `max` operations by thinning the points of each
 * stroke. Fills and stroke order are kept, so the replay looks the same apart
 * from slightly coarser curves. Returns the input unchanged if it already fits.
 */
export function compactOps(ops: readonly DrawOp[], max: number): DrawOp[] {
  if (ops.length <= max) return [...ops];
  let step = Math.ceil(ops.length / max);
  let result = compactWithStep(ops, step);
  // Many tiny strokes thin poorly (each keeps at least its two ends), so thin harder.
  while (result.length > max && step < ops.length) {
    step *= 2;
    result = compactWithStep(ops, step);
  }
  // Last resort: drop the latest operations rather than exceed the budget.
  return result.slice(0, max);
}

/** Fits the whole gallery into `totalBudget` operations, sharing it equally between drawings. */
export function fitGallery(entries: readonly GalleryEntry[], totalBudget = GALLERY_TOTAL_OPS): GalleryEntry[] {
  if (entries.length === 0) return [];
  const perDrawing = Math.max(2, Math.floor(totalBudget / entries.length));
  return entries.map((entry) => ({ ...entry, ops: compactOps(entry.ops, perDrawing) }));
}
