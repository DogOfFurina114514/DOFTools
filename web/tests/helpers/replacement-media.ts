import type { Page } from '@playwright/test'

export function replacementWav(duration: number) {
  const rate = 48000,
    frames = Math.round(rate * duration)
  const bytes = new Uint8Array(44 + frames * 2),
    view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) =>
    [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, bytes.length - 8, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, frames * 2, true)
  for (let index = 0; index < frames; index++)
    view.setInt16(44 + index * 2, Math.sin((index / rate) * Math.PI * 2 * 440) * 8000, true)
  return bytes
}

export async function replacementVideo(page: Page, withAudio = true) {
  return page.evaluate(async (withAudio) => {
    const path = '/node_modules/.vite/deps/mediabunny.js'
    const { Output, WebMOutputFormat, BufferTarget, CanvasSource, AudioBufferSource } =
      await import(path)
    const target = new BufferTarget(),
      output = new Output({ target, format: new WebMOutputFormat() })
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 90
    const video = new CanvasSource(canvas, { codec: 'vp9', bitrate: 300000 })
    output.addVideoTrack(video, { frameRate: 10 })
    const audio = withAudio ? new AudioBufferSource({ codec: 'opus', bitrate: 96000 }) : undefined
    if (audio) output.addAudioTrack(audio)
    await output.start()
    let audioDone = Promise.resolve()
    if (audio) {
      // An original audio track longer than the video must not change the
      // "match video" duration, and its 880 Hz tone must be removed.
      const buffer = new AudioBuffer({ length: 156000, sampleRate: 48000, numberOfChannels: 1 })
      const samples = buffer.getChannelData(0)
      for (let index = 0; index < samples.length; index++)
        samples[index] = Math.sin((index / 48000) * Math.PI * 2 * 880) * 0.2
      audioDone = audio.add(buffer)
    }
    for (let frame = 0; frame < 20; frame++) {
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = frame < 10 ? '#2255ee' : '#ff9900'
      ctx.fillRect(0, 0, 160, 90)
      await video.add(frame / 10, 0.1)
    }
    await audioDone
    await output.finalize()
    return Array.from(new Uint8Array(target.buffer)) as number[]
  }, withAudio)
}

export async function inspectReplacement(page: Page, bytes: number[], duration: number) {
  return page.evaluate(
    async ({ bytes, duration }) => {
      const path = '/node_modules/.vite/deps/mediabunny.js'
      const { Input, ALL_FORMATS, BlobSource, AudioBufferSink, VideoSampleSink } = await import(
        path
      )
      const input = new Input({
        source: new BlobSource(new Blob([new Uint8Array(bytes)])),
        formats: ALL_FORMATS,
      })
      try {
        const videos = await input.getVideoTracks(),
          audios = await input.getAudioTracks()
        const video = videos[0],
          audio = audios[0]
        const sink = new AudioBufferSink(audio)
        const energy = async (time: number) => {
          const wrapped = await sink.getBuffer(time)
          if (!wrapped) throw new Error('No decoded audio buffer')
          const data = wrapped.buffer.getChannelData(0),
            rate = wrapped.buffer.sampleRate
          const amplitude = (frequency: number) => {
            let real = 0,
              imaginary = 0
            for (let index = 0; index < data.length; index++) {
              real += data[index] * Math.cos((index / rate) * 2 * Math.PI * frequency)
              imaginary += data[index] * Math.sin((index / rate) * 2 * Math.PI * frequency)
            }
            return Math.hypot(real, imaginary) / data.length
          }
          return {
            rms: Math.sqrt(
              data.reduce((sum: number, value: number) => sum + value * value, 0) / data.length,
            ),
            replacement: amplitude(440),
            original: amplitude(880),
          }
        }
        const sample = await new VideoSampleSink(video).getSample(duration - 0.2)
        if (!sample) throw new Error('Missing last video frame')
        const canvas = document.createElement('canvas')
        canvas.width = 160
        canvas.height = 90
        const ctx = canvas.getContext('2d')!
        sample.draw(ctx, 0, 0)
        sample.close()
        return {
          duration: await input.computeDuration(),
          videoDuration: await video.computeDuration(),
          audioDuration: await audio.computeDuration(),
          videoTracks: videos.length,
          audioTracks: audios.length,
          color: Array.from(ctx.getImageData(80, 45, 1, 1).data),
          start: await energy(0.3),
          tail: await energy(duration - 0.3),
        }
      } finally {
        input.dispose()
      }
    },
    { bytes, duration },
  )
}
