import { useAppearance } from '../lib/appearance'

export function SceneArt() {
  const { style } = useAppearance()
  return (
    <div className={`scene-art scene-${style}`} aria-hidden="true">
      <span className="scene-orbit orbit-one" />
      <span className="scene-orbit orbit-two" />
      <span className="scene-orbit orbit-three" />
      <span className="scene-dot dot-one" />
      <span className="scene-dot dot-two" />
      <span className="scene-star star-one">✦</span>
      <span className="scene-star star-two">✧</span>
      <div className="scene-core">
        {style === 'zenless' ? (
          <>
            <span className="record-groove" />
            <span className="record-label">
              TOOL
              <br />
              BOX<span>PLAY YOUR OWN WAY</span>
            </span>
          </>
        ) : style === 'endfield' ? (
          <>
            <span className="coordinate cross-one" />
            <span className="coordinate cross-two" />
            <span className="terminal-core">
              TOOLS<span>DOGOFFURINA</span>
            </span>
          </>
        ) : style === 'genshin' ? (
          <svg viewBox="0 0 120 160" fill="none">
            <path d="M60 5L69 51L108 62L69 76L60 126L51 76L12 62L51 51Z" fill="currentColor" />
            <path d="M60 20L60 149M22 62H98" stroke="currentColor" strokeWidth="1" />
            <path d="M60 35L91 62L60 96L29 62Z" stroke="currentColor" strokeWidth="1" />
          </svg>
        ) : style === 'material' ? (
          <div className="material-flower">
            <i />
            <i />
            <i />
            <i />
          </div>
        ) : (
          <svg viewBox="0 0 120 120" fill="none">
            <path d="M60 18L70 48L102 60L70 72L60 103L49 72L18 60L49 48Z" fill="currentColor" />
            <circle cx="60" cy="60" r="9" fill="#f4f8ed" />
          </svg>
        )}
      </div>
      <span className="scene-caption">
        {style === 'zenless'
          ? 'SIDE A / YOUR LITTLE UNIVERSE'
          : style === 'endfield'
            ? 'X 032.51 · Y 048.72'
            : style === 'genshin'
              ? 'AD ASTRA · A NEW LITTLE JOURNEY'
              : style === 'material'
                ? 'A LITTLE MORE YOU'
                : 'a little space for something good'}
      </span>
    </div>
  )
}
