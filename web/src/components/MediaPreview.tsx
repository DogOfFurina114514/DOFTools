import { useRef, useState } from 'react'
import { Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useLocale } from '../lib/i18n'
import { IconButton, Slider } from './controls'

const timestamp = (seconds: number) => {
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** The media element supplies decoding; the shared controls supply its visible UI. */
export function MediaPreview({ src }: { src: string }) {
  const { t } = useLocale()
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState(false)
  return (
    <div className="ui-media-preview">
      <video
        key={src}
        ref={video}
        src={src}
        preload="metadata"
        playsInline
        onLoadedMetadata={(event) => {
          const media = event.currentTarget
          setDuration(Number.isFinite(media.duration) ? media.duration : 0)
          media.volume = volume
          media.muted = muted
          setPosition(0)
          setPlaying(false)
          setError(false)
        }}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setError(true)}
      />
      <div className="ui-media-controls">
        <IconButton
          aria-label={playing ? t('暂停', 'Pause') : t('播放', 'Play')}
          disabled={error}
          onClick={() => {
            const media = video.current
            if (!media) return
            if (media.paused) void media.play().catch(() => setError(true))
            else media.pause()
          }}
        >
          {playing ? <Pause size={20} /> : <Play size={20} />}
        </IconButton>
        <Slider
          label={t('播放进度（秒）', 'Playback position (seconds)')}
          value={position}
          min={0}
          max={duration}
          step={0.1}
          disabled={!duration || error}
          onValueChange={(next) => {
            if (video.current) video.current.currentTime = next
            setPosition(next)
          }}
        />
        <span className="ui-media-time">
          {timestamp(position)} / {timestamp(duration)}
        </span>
        <IconButton
          aria-label={muted ? t('取消静音', 'Unmute') : t('静音', 'Mute')}
          aria-pressed={muted}
          onClick={() => {
            if (video.current) video.current.muted = !muted
            setMuted(!muted)
          }}
        >
          {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </IconButton>
        <Slider
          label={t('音量', 'Volume')}
          value={Math.round(volume * 100)}
          min={0}
          max={100}
          onValueChange={(next) => {
            if (video.current) video.current.volume = next / 100
            setVolume(next / 100)
          }}
        />
      </div>
      {error && (
        <p role="alert">{t('浏览器无法播放此视频。', 'The browser could not play this video.')}</p>
      )}
    </div>
  )
}
