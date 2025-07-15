import React, { useRef, useEffect } from 'react';

export type DrawLine = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color?: string;
  thickness?: number;
};

interface DrawingCanvasProps {
  width?: number;
  height?: number;
  onDrawLine?: (line: DrawLine) => void;
  remoteLines?: DrawLine[];
  canDraw?: boolean;
}

const DEFAULT_COLOR = '#222';
const DEFAULT_THICKNESS = 3;

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  width = 800,
  height = 500,
  onDrawLine,
  remoteLines = [],
  canDraw = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  // Draw a line on the canvas
  const drawLine = (ctx: CanvasRenderingContext2D, line: DrawLine) => {
    ctx.strokeStyle = line.color || DEFAULT_COLOR;
    ctx.lineWidth = line.thickness || DEFAULT_THICKNESS;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(line.from.x, line.from.y);
    ctx.lineTo(line.to.x, line.to.y);
    ctx.stroke();
  };

  // Handle mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!canDraw) return;
    drawing.current = true;
    const rect = canvasRef.current!.getBoundingClientRect();
    lastPoint.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drawing.current || !canDraw) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const newPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    if (lastPoint.current) {
      const line: DrawLine = {
        from: lastPoint.current,
        to: newPoint,
        color: DEFAULT_COLOR,
        thickness: DEFAULT_THICKNESS,
      };
      const ctx = canvasRef.current!.getContext('2d');
      if (ctx) drawLine(ctx, line);
      if (onDrawLine) onDrawLine(line);
      lastPoint.current = newPoint;
    }
  };

  const handleMouseUp = () => {
    drawing.current = false;
    lastPoint.current = null;
  };

  // Render remote lines
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && remoteLines.length > 0) {
      remoteLines.forEach(line => drawLine(ctx, line));
    }
    // eslint-disable-next-line
  }, [remoteLines]);

  // Clear canvas on mount
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, width, height);
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 4px #0001', cursor: canDraw ? 'crosshair' : 'not-allowed' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
};

export default DrawingCanvas; 