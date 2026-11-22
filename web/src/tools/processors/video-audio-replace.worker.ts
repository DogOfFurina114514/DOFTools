import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'
import { bilingual as b, LocalizedError } from '../../lib/locale'
import type { ToolResult, ToolValues } from '../registry'
import { bytesBlob, outputName } from './shared'
import { getFFmpegCore, type FFmpegCore } from './ffmpeg'
import { replacementFiles } from './video-audio-replace-input'

self.onmessage = async ({ data }: MessageEvent<{ values: ToolValues }>) => {
  const values = data.values
  const progress = (value: number) => self.postMessage({ type: 'progress', value })
  const status = (zh: string, en: string) => self.postMessage({ type: 'status', value: b(zh, en) })
  let core: FFmpegCore | undefined
  let videoInput: Input | undefined
  let audioInput: Input | undefined
  const paths = ['video-input', 'audio-input', 'replaced.mp4', 'replaced.webm']
  try {
    const { video, audio } = replacementFiles(values)
    const format = String(values.format)
    if (!['mp4', 'webm'].includes(format) || !['video', 'audio'].includes(String(values.length)))
      throw new LocalizedError(
        '请选择有效的输出格式和长度。',
        'Choose a valid output format and length.',
      )
    status('正在读取视频和音频时长…', 'Reading video and audio durations…')
    videoInput = new Input({ source: new BlobSource(video), formats: ALL_FORMATS })
    audioInput = new Input({ source: new BlobSource(audio), formats: ALL_FORMATS })
    // These tracks match FFmpeg's explicit 0:v:0 and 1:a:0 maps.
    const videoTrack = (await videoInput.getVideoTracks())[0]
    const audioTrack = (await audioInput.getAudioTracks())[0]
    if (!videoTrack)
      throw new LocalizedError('视频文件中没有视频轨道。', 'The video file has no video track.')
    if (!audioTrack)
      throw new LocalizedError('音频文件中没有音频轨道。', 'The audio file has no audio track.')
    const videoDuration =
      (await videoTrack.computeDuration()) - Math.max(0, await videoTrack.getFirstTimestamp())
    const audioDuration =
      (await audioTrack.computeDuration()) - Math.max(0, await audioTrack.getFirstTimestamp())
    if (
      ![videoDuration, audioDuration].every((duration) => Number.isFinite(duration) && duration > 0)
    )
      throw new LocalizedError('无法读取有效的素材时长。', 'Cannot read valid media durations.')
    const duration = values.length === 'audio' ? audioDuration : videoDuration
    if (duration > 3600)
      throw new LocalizedError(
        '输出最长 60 分钟，请先截取素材。',
        'Output is limited to 60 minutes. Trim the media first.',
      )
    const naturalWidth = await videoTrack.getDisplayWidth()
    const naturalHeight = await videoTrack.getDisplayHeight()
    if (
      !(naturalWidth > 0 && naturalHeight > 0) ||
      naturalWidth > 8192 ||
      naturalHeight > 8192 ||
      naturalWidth * naturalHeight > 40_000_000
    )
      throw new LocalizedError(
        '视频尺寸最多 8192 × 8192 且不超过 4000 万像素。',
        'Video dimensions must fit 8192 × 8192 and 40 million pixels.',
      )
    const width = Math.ceil(naturalWidth / 2) * 2
    const height = Math.ceil(naturalHeight / 2) * 2
    videoInput.dispose()
    audioInput.dispose()
    videoInput = undefined
    audioInput = undefined

    status('正在加载本地音视频编解码器…', 'Loading the local media codec…')
    core = await getFFmpegCore()
    core.FS.writeFile('video-input', new Uint8Array(await video.arrayBuffer()))
    core.FS.writeFile('audio-input', new Uint8Array(await audio.arrayBuffer()))
    core.reset()
    core.setTimeout(180000)
    core.setProgress(({ time }) =>
      progress(0.05 + Math.min(1, Math.max(0, time / 1_000_000 / duration)) * 0.94),
    )
    status('正在替换音轨并对齐长度…', 'Replacing audio and matching the selected duration…')
    // Pad first, then trim: either selected duration works for both shorter and
    // longer inputs. Explicit maps discard every original audio track.
    const filter =
      `[0:v:0]setpts=PTS-STARTPTS,scale=${width}:${height}:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=${duration},trim=duration=${duration},setpts=PTS-STARTPTS[v];` +
      `[1:a:0]asetpts=PTS-STARTPTS,apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[a]`
    const codecs =
      format === 'mp4'
        ? [
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '23',
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            '-movflags',
            '+faststart',
          ]
        : [
            '-c:v',
            'libvpx',
            '-b:v',
            '2000k',
            '-crf',
            '10',
            '-cpu-used',
            '4',
            '-c:a',
            'libopus',
            '-b:a',
            '128k',
          ]
    const exit = core.exec(
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      'video-input',
      '-i',
      'audio-input',
      '-filter_complex',
      filter,
      '-map',
      '[v]',
      '-map',
      '[a]',
      '-t',
      String(duration),
      '-pix_fmt',
      'yuv420p',
      '-ar',
      '48000',
      '-vsync',
      'vfr',
      ...codecs,
      '-threads',
      '1',
      '-y',
      `replaced.${format}`,
    )
    if (exit !== 0)
      throw new LocalizedError(
        '音轨替换失败或处理超时，请检查文件，或先缩短视频、降低分辨率后重试。',
        'Audio replacement failed or timed out. Check the files, or retry with a shorter video or lower resolution.',
      )
    const bytes = new Uint8Array(core.FS.readFile(`replaced.${format}`))
    if (!bytes.byteLength) throw new Error('Empty media output')
    const details = [
      b(
        `视频 ${videoDuration.toFixed(2)} 秒，音频 ${audioDuration.toFixed(2)} 秒；按${values.length === 'audio' ? '音频' : '视频'}长度输出 ${duration.toFixed(2)} 秒。`,
        `Video ${videoDuration.toFixed(2)} s, audio ${audioDuration.toFixed(2)} s; output ${duration.toFixed(2)} s using the ${values.length === 'audio' ? 'audio' : 'video'} duration.`,
      ),
    ]
    if (audioDuration < duration - 0.01)
      details.push(b('音频不足的尾部已补静音。', 'The shorter audio ends with silence.'))
    if (videoDuration < duration - 0.01)
      details.push(b('视频不足的尾部已延长最后一帧。', 'The shorter video holds its last frame.'))
    const result: ToolResult = {
      summary: b('视频音轨已替换。', 'Replaced the video audio track.'),
      details,
      files: [{ name: outputName(video.name, format), blob: bytesBlob(bytes, `video/${format}`) }],
    }
    progress(1)
    self.postMessage({ type: 'result', value: result })
  } catch (error) {
    if (import.meta.env.DEV) console.error('Video audio replacement failed', error)
    self.postMessage({
      type: 'error',
      value:
        error instanceof LocalizedError
          ? error.messages
          : b(
              '视频替换音频失败，请选择有效、未加密的音视频文件。',
              'Audio replacement failed. Choose valid, unencrypted video and audio files.',
            ),
    })
  } finally {
    videoInput?.dispose()
    audioInput?.dispose()
    core?.reset()
    for (const path of paths) {
      try {
        core?.FS.unlink(path)
      } catch {
        /* A failed run may not have created this file. */
      }
    }
  }
}
