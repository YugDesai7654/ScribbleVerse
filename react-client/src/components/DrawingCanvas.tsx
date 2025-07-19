"use client"
import { useRef, useEffect, useState } from "react"
import type React from "react"

export type DrawLine = {
  prevPoint: Point | null
  currentPoint: Point
  color: string
}

export type Point = { x: number; y: number }

interface DrawingCanvasProps {
  width: number
  height: number
  onDrawLine: (line: DrawLine) => void
  remoteLines: DrawLine[]
  canDraw: boolean
}

export default function DrawingCanvas({ width, height, onDrawLine, remoteLines, canDraw }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const prevPointRef = useRef<Point | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [color] = useState("#000000")

  // Effect to handle drawing lines and clearing the canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Clear the canvas completely before redrawing
    ctx.clearRect(0, 0, width, height)

    // Redraw all lines
    remoteLines.forEach((line) => drawLineOnCanvas(line, ctx))
  }, [remoteLines, width, height]) // Rerun when lines or dimensions change

  const getPointInCanvas = (e: MouseEvent | TouchEvent | React.MouseEvent): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()

    let clientX: number, clientY: number

    if ("touches" in e) {
      // Touch event
      clientX = e.touches[0]?.clientX || e.changedTouches[0]?.clientX || 0
      clientY = e.touches[0]?.clientY || e.changedTouches[0]?.clientY || 0
    } else {
      // Mouse event
      clientX = e.clientX
      clientY = e.clientY
    }

    const x = clientX - rect.left
    const y = clientY - rect.top
    return { x, y }
  }

  const drawLineOnCanvas = (line: DrawLine, ctx: CanvasRenderingContext2D) => {
    const { prevPoint, currentPoint, color: line_color } = line
    const startPoint = prevPoint ?? currentPoint
    ctx.beginPath()
    ctx.lineWidth = 4
    ctx.strokeStyle = line_color
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.moveTo(startPoint.x, startPoint.y)
    ctx.lineTo(currentPoint.x, currentPoint.y)
    ctx.stroke()
  }

  const handleStartDrawing = (e: MouseEvent | TouchEvent | React.MouseEvent) => {
    if (!canDraw) return

    // Only prevent default for touch events
    if ("touches" in e) {
      e.preventDefault()
    }

    setIsDrawing(true)
    const currentPoint = getPointInCanvas(e)
    prevPointRef.current = currentPoint
  }

  const handleDraw = (e: MouseEvent | TouchEvent | React.MouseEvent) => {
    if (!isDrawing || !canDraw) return

    // Only prevent default for touch events
    if ("touches" in e) {
      e.preventDefault()
    }

    const currentPoint = getPointInCanvas(e)
    const line: DrawLine = {
      prevPoint: prevPointRef.current,
      currentPoint,
      color,
    }
    onDrawLine(line)
    prevPointRef.current = currentPoint
  }

  const handleEndDrawing = (e?: React.MouseEvent | TouchEvent) => {
    if (e && "touches" in e) {
      e.preventDefault()
    }
    setIsDrawing(false)
    prevPointRef.current = null
  }

  // Effect to handle touch events with non-passive listeners
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Touch event handlers
    const handleTouchStart = (e: TouchEvent) => handleStartDrawing(e)
    const handleTouchMove = (e: TouchEvent) => handleDraw(e)
    const handleTouchEnd = (e: TouchEvent) => handleEndDrawing(e)

    // Add touch event listeners with { passive: false }
    canvas.addEventListener("touchstart", handleTouchStart, { passive: false })
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false })
    canvas.addEventListener("touchend", handleTouchEnd, { passive: false })
    canvas.addEventListener("touchcancel", handleTouchEnd, { passive: false })

    // Cleanup
    return () => {
      canvas.removeEventListener("touchstart", handleTouchStart)
      canvas.removeEventListener("touchmove", handleTouchMove)
      canvas.removeEventListener("touchend", handleTouchEnd)
      canvas.removeEventListener("touchcancel", handleTouchEnd)
    }
  }, [canDraw, isDrawing, color]) // Dependencies for the handlers

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      // Keep mouse events as React synthetic events (they don't have the passive issue)
      onMouseDown={handleStartDrawing}
      onMouseMove={handleDraw}
      onMouseUp={handleEndDrawing}
      onMouseLeave={handleEndDrawing}
      // Remove touch events from JSX - we handle them with native listeners above
      className={`bg-white rounded-lg ${canDraw ? "cursor-crosshair" : "cursor-not-allowed"}`}
      style={{ touchAction: "none" }} // Prevents scrolling on mobile while drawing
    />
  )
}
