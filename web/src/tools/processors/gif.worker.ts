import { bilingual as b, LocalizedError } from '../../lib/locale'
import type { ToolResult, ToolValues } from '../registry'
import { bytesBlob, inputFiles, outputName } from './shared'
import { getFFmpegCore, type FFmpegCore } from './ffmpeg'
import { fitGifDimensions, inspectGif } from './gif-info'

self.onmessage = async ({ data }: MessageEvent<{ values: ToolValues }>) => {
  const values = data.values
  const progress = (value: number) => self.postMessage({ type: 'progress', value })
  const status = (zh: string, en: string) => self.postMessage({ type: 'status', value: b(zh, en) })
  let core: FFmpegCore | undefined
  const paths = ['input', 'palette.png', 'output.gif', 'output.mp4', 'output.webm']
  try {
    const file = inputFiles(values, 128)[0]
    const input = new Uint8Array(await file.arrayBuffer())
    const gif = values.mode === 'gif-video' ? inspectGif(input) : undefined
    status('正在加载本地 GIF 编解码器…', 'Loading the local GIF codec…')
    core = await getFFmpegCore()
    core.FS.writeFile('input', input)
    const run = (args: string[], start: number, share: number, duration: number) => {
      core!.reset()
      core!.setTimeout(180000)
      core!.setProgress(({ time }) =>
        progress(start + Math.min(1, Math.max(0, time / 1_000_000 / duration)) * share),
      )
      const exit = core!.exec('-hide_banner', '-loglevel', 'error', ...args)
      if (exit !== 0)
        throw new LocalizedError(
          'GIF / 视频编解码失败或处理超时，请检查文件，或缩短片段、降低尺寸后重试。',
          'GIF / video conversion failed or timed out. Check the file, or retry with a shorter clip or smaller dimensions.',
        )
    }
    let result: ToolResult
    if (!gif) {
      status('正在读取视频信息…', 'Reading video metadata…')
      const logs: string[] = []
      core.setLogger(({ message }) => {
        if (logs.length < 100) logs.push(message)
      })
      core.setTimeout(30000)
      const exit = core.exec(
        '-hide_banner',
        '-loglevel',
        'info',
        '-i',
        'input',
        '-map',
        '0:v:0',
        '-c:v',
        'copy',
        '-frames:v',
        '0',
        '-f',
        'null',
        '-',
      )
      core.reset()
      core.setLogger(() => {})
      const videoLine = logs.find((line) => /Stream .*Video:/.test(line))
      const dimensions = videoLine?.split('Video:')[1]?.match(/\b([1-9]\d*)x([1-9]\d*)\b/)
      if (exit !== 0 || !dimensions)
        throw new LocalizedError(
          '无法读取视频，请选择未损坏、未加密的视频文件。',
          'Cannot read the video. Choose a valid, unencrypted video file.',
        )
      const width = Number(dimensions[1]),
        height = Number(dimensions[2])
      if (!width || !height || width > 8192 || height > 8192 || width * height > 40_000_000)
        throw new LocalizedError(
          '视频尺寸最多 8192 × 8192 且不超过 4000 万像素。',
          'Video dimensions must fit 8192 × 8192 and 40 million pixels.',
        )
      const time = logs.join('\n').match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/)
      const sourceDuration = time
        ? Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3])
        : Infinity
      const start = Number(values.start),
        requested = Number(values.duration),
        fps = Number(values.fps)
      const duration = Math.min(requested, sourceDuration - start)
      if (!(duration > 0))
        throw new LocalizedError(
          '开始时间超出了视频时长，请调整截取起点。',
          'The start time is beyond the video. Choose an earlier start.',
        )
      const sar = videoLine?.match(/SAR (\d+):(\d+)/)
      const displayWidth =
        width *
        (sar && Number(sar[1]) > 0 && Number(sar[2]) > 0 ? Number(sar[1]) / Number(sar[2]) : 1)
      const rotation = Number(logs.join('\n').match(/rotation of (-?[\d.]+) degrees/)?.[1] ?? 0)
      const rotated = Math.abs(Math.round(rotation / 90) % 2) === 1
      const size = fitGifDimensions(
        rotated ? height : displayWidth,
        rotated ? displayWidth : height,
        Number(values.maxEdge),
      )
      const trim = ['-ss', String(start), '-t', String(duration), '-i', 'input']
      const filter = `fps=${fps}:eof_action=pass,scale=${size.width}:${size.height}:flags=lanczos,setsar=1`
      status('正在分析片段颜色…', 'Analyzing clip colors…')
      // Two passes keep palette analysis bounded instead of retaining every frame in a split graph.
      run(
        [
          ...trim,
          '-an',
          '-vf',
          `${filter},palettegen=reserve_transparent=0`,
          '-frames:v',
          '1',
          '-threads',
          '1',
          'palette.png',
        ],
        0.05,
        0.3,
        duration,
      )
      status('正在生成 GIF 动画…', 'Encoding the animated GIF…')
      run(
        [
          '-ss',
          String(start),
          '-t',
          String(duration),
          '-i',
          'input',
          '-i',
          'palette.png',
          '-t',
          String(duration),
          '-an',
          '-filter_complex',
          `[0:v:0]${filter}[v];[v][1:v:0]paletteuse=dither=sierra2_4a[out]`,
          '-map',
          '[out]',
          '-loop',
          values.loop ? '0' : '-1',
          '-final_delay',
          String(Math.max(2, Math.round((duration - (Math.ceil(duration * fps) - 1) / fps) * 100))),
          '-threads',
          '1',
          'output.gif',
        ],
        0.35,
        0.64,
        duration,
      )
      const bytes = new Uint8Array(core.FS.readFile('output.gif'))
      const info = inspectGif(bytes)
      result = {
        summary: b('视频已转换为 GIF。', 'Converted the video to GIF.'),
        details: [
          b(
            `${info.width} × ${info.height}，${info.frames} 帧，${info.duration.toFixed(2)} 秒；${values.loop ? '无限循环' : '播放一次'}。GIF 不含音轨。`,
            `${info.width} × ${info.height}, ${info.frames} frames, ${info.duration.toFixed(2)} seconds; ${values.loop ? 'loops forever' : 'plays once'}. GIF has no audio.`,
          ),
        ],
        files: [{ name: outputName(file.name, 'gif'), blob: bytesBlob(bytes, 'image/gif') }],
      }
    } else {
      const format = String(values.format)
      if (!['mp4', 'webm'].includes(format)) throw new Error('Invalid format')
      const background = values.background === 'black' ? 'black' : 'white'
      const channel = background === 'black' ? 0 : 255
      const size = fitGifDimensions(gif.width, gif.height, Number(values.maxEdge))
      const width = size.width + (size.width % 2),
        height = size.height + (size.height % 2)
      status('正在将 GIF 动画编码为视频…', 'Encoding the GIF animation as video…')
      // GIF times are centiseconds. At 100 fps the original delays (including the
      // last frame) are representable; padding then trimming also handles a still GIF.
      const filter = `[0:v:0]scale=${size.width}:${size.height}:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=${gif.lastDelay},fps=100,format=rgba,split[bg][fg];[bg]lutrgb=r=${channel}:g=${channel}:b=${channel},format=rgb24[base];[base][fg]overlay=shortest=1:format=auto,pad=${width}:${height}:0:0:color=${background},format=yuv420p[out]`
      const encoder =
        format === 'mp4'
          ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-movflags', '+faststart']
          : ['-c:v', 'libvpx', '-b:v', '1000k', '-crf', '10', '-cpu-used', '4']
      run(
        [
          '-ignore_loop',
          '1',
          '-min_delay',
          '2',
          '-default_delay',
          '10',
          '-i',
          'input',
          '-t',
          String(gif.duration),
          '-filter_complex',
          filter,
          '-map',
          '[out]',
          '-an',
          '-pix_fmt',
          'yuv420p',
          ...encoder,
          '-threads',
          '1',
          `output.${format}`,
        ],
        0.05,
        0.94,
        gif.duration,
      )
      const bytes = new Uint8Array(core.FS.readFile(`output.${format}`))
      if (!bytes.byteLength) throw new Error('Empty video output')
      result = {
        summary: b(
          `GIF 已转换为 ${format.toUpperCase()}。`,
          `Converted the GIF to ${format.toUpperCase()}.`,
        ),
        details: [
          b(
            `${width} × ${height}，${gif.duration.toFixed(2)} 秒，保留 ${gif.frames} 帧的播放节奏；仅播放一个循环，${background === 'white' ? '白色' : '黑色'}背景，无音轨。`,
            `${width} × ${height}, ${gif.duration.toFixed(2)} seconds, preserving the timing of ${gif.frames} GIF frames; one cycle, ${background} background, no audio.`,
          ),
        ],
        files: [{ name: outputName(file.name, format), blob: bytesBlob(bytes, `video/${format}`) }],
      }
    }
    progress(1)
    self.postMessage({ type: 'result', value: result })
  } catch (error) {
    if (import.meta.env.DEV) console.error('GIF conversion failed', error)
    self.postMessage({
      type: 'error',
      value:
        error instanceof LocalizedError
          ? error.messages
          : b(
              'GIF 转换失败，请检查文件或降低尺寸后重试。',
              'GIF conversion failed. Check the file or retry with smaller dimensions.',
            ),
    })
  } finally {
    core?.reset()
    for (const path of paths) {
      try {
        core?.FS.unlink(path)
      } catch {
        /* A failed conversion may not have created the output. */
      }
    }
  }
}
