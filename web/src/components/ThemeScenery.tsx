import { useEffect, useRef } from 'react'
import { presetFor, useAppearance } from '../lib/appearance'

const segments: number[][] = [
  [],
  [3, 0],
  [0, 1],
  [3, 1],
  [1, 2],
  [3, 2, 0, 1],
  [0, 2],
  [3, 2],
  [2, 3],
  [0, 2],
  [0, 3, 1, 2],
  [1, 2],
  [1, 3],
  [0, 1],
  [3, 0],
  [],
]

function Terrain({ moving, dark }: { moving: boolean; dark: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current!
    const context = element.getContext('2d')
    if (!context) return
    let frame = 0,
      last = -Infinity,
      width = 0,
      height = 0
    let columns = 0,
      rows = 0,
      heights = new Float32Array(0)
    const spacing = 22
    const resize = () => {
      width = innerWidth
      height = innerHeight
      const ratio = Math.min(devicePixelRatio || 1, 1.5)
      element.width = Math.ceil(width * ratio)
      element.height = Math.ceil(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      columns = Math.ceil(width / spacing) + 1
      rows = Math.ceil(height / spacing) + 1
      heights = new Float32Array(columns * rows)
      draw(0)
    }
    const draw = (time: number) => {
      const phase = time / 24000
      const centers = [
        [0.25 + Math.sin(phase) * 0.07, 0.3, 0.85, 0.18],
        [0.72, 0.62 + Math.cos(phase * 0.8) * 0.08, 1, 0.22],
        [0.98 + Math.cos(phase * 0.6) * 0.06, 0.05, 0.7, 0.16],
        [0.03, 0.95 + Math.sin(phase * 0.7) * 0.04, 0.6, 0.2],
      ]
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < columns; x++) {
          const nx = (x * spacing) / width,
            ny = (y * spacing) / height
          let value = 0
          for (const [cx, cy, amplitude, radius] of centers)
            value += amplitude * Math.exp(-((nx - cx) ** 2 + (ny - cy) ** 2) / radius ** 2)
          heights[y * columns + x] = value
        }
      context.clearRect(0, 0, width, height)
      context.strokeStyle = dark ? 'rgba(201,205,181,.22)' : 'rgba(60,65,49,.22)'
      for (let band = 1; band <= 11; band++) {
        const level = band * 0.085
        context.lineWidth = band % 3 === 0 ? 1.35 : 0.7
        context.beginPath()
        for (let y = 0; y < rows - 1; y++)
          for (let x = 0; x < columns - 1; x++) {
            const a = heights[y * columns + x],
              b = heights[y * columns + x + 1]
            const c = heights[(y + 1) * columns + x + 1],
              d = heights[(y + 1) * columns + x]
            const mask =
              Number(a >= level) |
              (Number(b >= level) << 1) |
              (Number(c >= level) << 2) |
              (Number(d >= level) << 3)
            const edges = segments[mask]
            if (!edges.length) continue
            const blend = (first: number, second: number) => (level - first) / (second - first)
            const point = (edge: number): [number, number] => {
              if (edge === 0) return [(x + blend(a, b)) * spacing, y * spacing]
              if (edge === 1) return [(x + 1) * spacing, (y + blend(b, c)) * spacing]
              if (edge === 2) return [(x + blend(d, c)) * spacing, (y + 1) * spacing]
              return [x * spacing, (y + blend(a, d)) * spacing]
            }
            for (let index = 0; index < edges.length; index += 2) {
              context.moveTo(...point(edges[index]))
              context.lineTo(...point(edges[index + 1]))
            }
          }
        context.stroke()
      }
    }
    const tick = (time: number) => {
      if (time - last >= 1000 / 12) {
        draw(time)
        last = time
      }
      frame = requestAnimationFrame(tick)
    }
    const visibility = () => {
      cancelAnimationFrame(frame)
      if (moving && !document.hidden) frame = requestAnimationFrame(tick)
    }
    resize()
    visibility()
    addEventListener('resize', resize)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      cancelAnimationFrame(frame)
      removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [moving, dark])
  return <canvas ref={canvas} className="terrain-contours" />
}

export function ThemeScenery({ suspended = false }: { suspended?: boolean }) {
  const { style, mode, sceneMotion, reducedMotion } = useAppearance()
  if (!presetFor(style).game) return null
  return (
    <div
      className={`theme-scenery scenery-${style}`}
      aria-hidden="true"
      data-moving={sceneMotion && !reducedMotion && !suspended}
    >
      {style === 'endfield' ? (
        <>
          <Terrain moving={sceneMotion && !reducedMotion && !suspended} dark={mode === 'dark'} />
          <div className="terrain-grid" />
          <div className="terrain-cross cross-one" />
          <div className="terrain-cross cross-two" />
        </>
      ) : style === 'genshin' ? (
        <>
          <div className="celestial-haze" />
          <svg
            className="celestial-map"
            viewBox="0 0 1200 800"
            preserveAspectRatio="xMidYMid slice"
          >
            <g fill="none" stroke="currentColor" strokeWidth="0.8">
              <circle cx="900" cy="280" r="180" />
              <circle cx="900" cy="280" r="205" strokeDasharray="2 12" />
              <path d="M590 50 680 170 820 210 900 100 1050 165 1120 290M240 650 350 520 440 590 580 450" />
            </g>
            {[
              [590, 50],
              [680, 170],
              [820, 210],
              [900, 100],
              [1050, 165],
              [1120, 290],
              [240, 650],
              [350, 520],
              [440, 590],
              [580, 450],
            ].map(([x, y]) => (
              <path key={`${x}-${y}`} d={`M${x} ${y - 5}l3 5-3 5-3-5Z`} fill="currentColor" />
            ))}
          </svg>
          <div className="celestial-cloud cloud-one" />
          <div className="celestial-cloud cloud-two" />
        </>
      ) : style === 'zenless' ? (
        <>
          <div className="city-halftone" />
          <div className="city-sticker">ZZZ</div>
          <div className="city-record" />
          <div className="city-scan" />
        </>
      ) : (
        <>
          <div className="pixel-sun" />
          <div className="pixel-cloud cloud-one" />
          <div className="pixel-cloud cloud-two" />
          <svg
            className="pixel-landscape"
            viewBox="0 0 1200 400"
            preserveAspectRatio="xMidYMax slice"
          >
            <path
              className="pixel-ridge-back"
              d="M0 400V180h80v-60h110v40h80V80h130v70h80v70h110v-90h90V50h110v110h110v-50h100v70h110v220Z"
            />
            <path
              className="pixel-ridge-front"
              d="M0 400V270h130v-50h100v60h120v-80h90v40h110v70h110v-90h90v50h110v-70h120v90h100v-40h100v120Z"
            />
          </svg>
        </>
      )}
    </div>
  )
}
