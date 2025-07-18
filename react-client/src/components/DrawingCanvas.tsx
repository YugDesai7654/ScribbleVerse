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
  const [isDrawing, setIsDrawing] = useState(false);
  const prevPointRef = useRef<Point | null>(null);
  const [color] = useState('#000000'); // Using black for drawing

  // Effect to handle drawing remote lines and clearing the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // **THIS IS THE FIX**: Clear the canvas completely before redrawing
    ctx.clearRect(0, 0, width, height);

    // Redraw all lines (local and remote) from the state
    const allLines = [...remoteLines]; // In this setup, remoteLines is the single source of truth
    allLines.forEach(line => drawLineOnCanvas(line, ctx));

  }, [remoteLines, width, height]); // Rerun when lines or dimensions change

  const getPointInCanvas = (e: React.MouseEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { x, y };
  };

  const drawLineOnCanvas = (line: DrawLine, ctx: CanvasRenderingContext2D) => {
    const { prevPoint, currentPoint, color: line_color } = line;
    const startPoint = prevPoint ?? currentPoint;
    ctx.beginPath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = line_color;
    ctx.lineCap = 'round';
    ctx.moveTo(startPoint.x, startPoint.y);
    ctx.lineTo(currentPoint.x, currentPoint.y);
    ctx.stroke();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!canDraw) return;
    setIsDrawing(true);
    const currentPoint = getPointInCanvas(e);
    prevPointRef.current = currentPoint;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !canDraw) return;

    const currentPoint = getPointInCanvas(e);
    const line: DrawLine = {
      prevPoint: prevPointRef.current,
      currentPoint,
      color,
    };
    
    // Immediately emit the line to be drawn on other clients
    onDrawLine(line);
    
    prevPointRef.current = currentPoint;
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    prevPointRef.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp} // End drawing if mouse leaves canvas
      className={`bg-white rounded-lg ${canDraw ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
      style={{ touchAction: 'none' }}
    />
  );
}
