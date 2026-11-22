import { beforeEach, describe, expect, it } from "vitest"
import { fillPixels } from "./render"

const SIZE = 100
const RED: [number, number, number] = [255, 0, 0]

function setPixel(data: Uint8ClampedArray, x: number, y: number, rgb: [number, number, number]) {
  const i = (y * SIZE + x) * 4
  data[i] = rgb[0]
  data[i + 1] = rgb[1]
  data[i + 2] = rgb[2]
  data[i + 3] = 255
}
const getPixel = (data: Uint8ClampedArray, x: number, y: number) => {
  const i = (y * SIZE + x) * 4
  return [data[i], data[i + 1], data[i + 2]]
}

/** 100x100 white buffer with a black 2 px square outline whose outer edge spans 20..80. */
function outlinedSquare() {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4).fill(255)
  for (let a = 20; a <= 80; a++) {
    for (const t of [0, 1]) {
      setPixel(data, a, 20 + t, [0, 0, 0])
      setPixel(data, a, 79 - t + 1, [0, 0, 0])
      setPixel(data, 20 + t, a, [0, 0, 0])
      setPixel(data, 79 - t + 1, a, [0, 0, 0])
    }
  }
  return data
}

describe("fillPixels", () => {
  let data: Uint8ClampedArray
  beforeEach(() => {
    data = outlinedSquare()
  })

  it("fills the enclosed region and nothing outside the outline", () => {
    fillPixels(data, SIZE, SIZE, 50, 50, RED)
    expect(getPixel(data, 50, 50)).toEqual(RED)
    expect(getPixel(data, 10, 10)).toEqual([255, 255, 255])
  })

  it("recolours a light-grey anti-aliasing pixel just inside the outline (BUG-008)", () => {
    setPixel(data, 22, 50, [200, 200, 200])
    fillPixels(data, SIZE, SIZE, 50, 50, RED)
    expect(getPixel(data, 22, 50)).toEqual(RED)
  })

  it("leaves a mid-grey line pixel next to the region alone", () => {
    setPixel(data, 23, 50, [107, 114, 128])
    fillPixels(data, SIZE, SIZE, 50, 50, RED)
    expect(getPixel(data, 23, 50)).toEqual([107, 114, 128])
  })

  it("never writes more than 2 px outside the filled region's bounding box", () => {
    // Outside the outline: light-grey pixels hugging it, which edge passes must not reach.
    for (let a = 15; a <= 85; a++) {
      setPixel(data, a, 15, [200, 200, 200])
      setPixel(data, 15, a, [200, 200, 200])
    }
    const before = data.slice()
    fillPixels(data, SIZE, SIZE, 50, 50, RED)
    // The filled region spans 22..77, so the allowed box is 20..79.
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (x >= 20 && x <= 79 && y >= 20 && y <= 79) continue
        const i = (y * SIZE + x) * 4
        expect([...data.slice(i, i + 4)]).toEqual([...before.slice(i, i + 4)])
      }
    }
  })
})
