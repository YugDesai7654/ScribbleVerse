'use client'
import { useEffect, useRef, useState } from 'react';

export type DrawLine = {
  prevPoint: Point | null;
  currentPoint: Point;
  color: string;
};

export type Point = { x: number; y: number };

interface DrawingCanvasProps {
  width: number;
  height: number;
  onDrawLine: (line: DrawLine) => void;
  remoteLines: DrawLine[];
  canDraw: boolean;
}

export default function DrawingCanvas({ width, height, onDrawLine, remoteLines, canDraw }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevPointRef = useRef<Point | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color] = useState('#000000');

  // Effect to handle drawing lines and clearing the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear the canvas completely before redrawing
    ctx.clearRect(0, 0, width, height);

    // Redraw all lines
    remoteLines.forEach(line => drawLineOnCanvas(line, ctx));

  }, [remoteLines, width, height]); // Rerun when lines or dimensions change

  const getPointInCanvas = (e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return { x, y };
  };

  const drawLineOnCanvas = (line: DrawLine, ctx: CanvasRenderingContext2D) => {
    const { prevPoint, currentPoint, color: line_color } = line;
    const startPoint = prevPoint ?? currentPoint;
    ctx.beginPath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = line_color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(startPoint.x, startPoint.y);
    ctx.lineTo(currentPoint.x, currentPoint.y);
    ctx.stroke();
  };

  const handleStartDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canDraw) return;
    e.preventDefault();
    setIsDrawing(true);
    const currentPoint = getPointInCanvas(e);
    prevPointRef.current = currentPoint;
  };

  const handleDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !canDraw) return;
    e.preventDefault();
    const currentPoint = getPointInCanvas(e);
    const line: DrawLine = {
      prevPoint: prevPointRef.current,
      currentPoint,
      color,
    };
    onDrawLine(line);
    prevPointRef.current = currentPoint;
  };

  const handleEndDrawing = () => {
    setIsDrawing(false);
    prevPointRef.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onMouseDown={handleStartDrawing}
      onMouseMove={handleDraw}
      onMouseUp={handleEndDrawing}
      onMouseLeave={handleEndDrawing}
      onTouchStart={handleStartDrawing}
      onTouchMove={handleDraw}
      onTouchEnd={handleEndDrawing}
      className={`bg-white rounded-lg ${canDraw ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
      style={{ touchAction: 'none' }} // Prevents scrolling on mobile while drawing
    />
  );
}
