import { bilingual as b } from '../lib/locale'
import type { ToolDefinition, ToolField, ToolValues } from './registry'
import { midiAudioAccept, midiAudioFormats } from './processors/midi-formats'
import { prepareToolResources } from '../lib/offline'

const files = (accept: string, multiple = false): ToolField => ({
  type: 'files',
  name: 'files',
  label: b('选择文件', 'Choose files'),
  accept,
  multiple,
  required: true,
})
const format = (formats: string[], initialLabel = b('输出格式', 'Output format')): ToolField => ({
  type: 'select',
  name: 'format',
  label: initialLabel,
  options: formats.map((value) => ({ value, label: b(value.toUpperCase(), value.toUpperCase()) })),
})
const mediaAccept = 'video/*,.mp4,.webm,.mov,.mkv,.avi,.m4v,.ts,.ogg'
const audioAccept = 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac,.webm,.mp4'
const gifMaxEdge: ToolField = {
  type: 'number',
  name: 'maxEdge',
  label: b('最长边（像素）', 'Maximum edge (pixels)'),
  min: 64,
  max: 1280,
  step: 1,
  help: b(
    '保持比例，不放大；尺寸越小，转换越快。',
    'Keeps aspect ratio without upscaling. Smaller sizes convert faster.',
  ),
}
const compressionMode: ToolField = {
  type: 'select',
  name: 'compressionMode',
  label: b('压缩方式', 'Compression mode'),
  options: [
    { value: 'manual', label: b('手动输入参数', 'Enter parameters') },
    { value: 'target', label: b('按目标大小自动计算', 'Calculate from target size') },
  ],
}
const targetFields: ToolField[] = [
  {
    type: 'number',
    name: 'targetSize',
    label: b('目标大小（每个文件）', 'Target size (per file)'),
    min: 0.001,
    max: 262144,
    step: 0.001,
    visibleWhen: { field: 'compressionMode', value: 'target' },
    help: b(
      '输出不超过此大小；目标过小时会提示无法达到。',
      'Output must fit this limit; an unattainable target reports an error.',
    ),
  },
  {
    type: 'select',
    name: 'sizeUnit',
    label: b('大小单位', 'Size unit'),
    options: [
      { value: 'kib', label: b('KiB（1024 字节）', 'KiB (1024 bytes)') },
      { value: 'mib', label: b('MiB（1024 KiB）', 'MiB (1024 KiB)') },
    ],
    visibleWhen: { field: 'compressionMode', value: 'target' },
  },
]
function fieldSchema(field: ToolField): Record<string, unknown> {
  if (field.type === 'files')
    return { type: 'array', minItems: 1, ...(!field.multiple && { maxItems: 1 }) }
  if (field.type === 'select')
    return { type: 'string', enum: field.options.map((option) => option.value) }
  if (field.type === 'number' || field.type === 'slider')
    return {
      type: 'number',
      minimum: field.min,
      maximum: field.max,
      ...(field.step === 1 && { multipleOf: 1 }),
    }
  if (field.type === 'checkbox' || field.type === 'switch') return { type: 'boolean' }
  return { type: 'string' }
}
function define(
  id: string,
  title: [string, string],
  description: [string, string],
  tags: ToolDefinition['tags'],
  fields: ToolField[],
  initialValues: ToolValues,
  execute: ToolDefinition['execute'],
): ToolDefinition {
  return {
    id,
    title: b(...title),
    description: b(...description),
    tags,
    fields,
    initialValues,
    execute: async (values, context) => {
      context.onStatus?.(b('正在准备工具资源…', 'Preparing tool resources…'))
      await prepareToolResources(context.signal)
      return execute(values, context)
    },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(
        fields.map((field) => [field.name, field.visibleWhen ? {} : fieldSchema(field)]),
      ),
      required: fields.filter((field) => !field.visibleWhen).map((field) => field.name),
      ...(fields.some((field) => field.visibleWhen) && {
        allOf: fields
          .filter((field) => field.visibleWhen)
          .map((field) => ({
            if: {
              properties: { [field.visibleWhen!.field]: { const: field.visibleWhen!.value } },
              required: [field.visibleWhen!.field],
            },
            then: { properties: { [field.name]: fieldSchema(field) }, required: [field.name] },
          })),
      }),
    },
  }
}

export const builtinTools: ToolDefinition[] = [
  define(
    'image-compress',
    ['图片压缩', 'Image compressor'],
    [
      '批量压缩为 JPG、WebP 或 PNG。手动输入质量与最长边，或输入每张目标大小自动计算质量与尺寸；JPG 白底，动图仅第一帧。',
      'Batch compress images as JPG, WebP or PNG. Enter quality and maximum edge, or a per-image size limit for automatic quality and dimensions. JPEG uses white backgrounds; animations export their first frame.',
    ],
    ['image'],
    [
      files('image/*,.svg,.bmp,.gif,.avif', true),
      format(['jpg', 'webp', 'png']),
      compressionMode,
      {
        type: 'number',
        name: 'quality',
        label: b('图片质量（1–100）', 'Image quality (1–100)'),
        min: 1,
        max: 100,
        step: 1,
        visibleWhen: { field: 'compressionMode', value: 'manual' },
        help: b(
          'JPG / WebP 的有损质量；PNG 不使用此值。',
          'Lossy quality for JPG / WebP; PNG ignores this value.',
        ),
      },
      {
        type: 'number',
        name: 'maxEdge',
        label: b('最长边（像素，0 为原始尺寸）', 'Maximum edge (pixels; 0 = original)'),
        min: 0,
        max: 32768,
        step: 1,
        help: b(
          '保持比例且不放大。目标模式必要时自动进一步缩小。',
          'Keeps aspect ratio without upscaling. Target mode may reduce dimensions further.',
        ),
      },
      ...targetFields,
    ],
    {
      files: [],
      format: 'webp',
      compressionMode: 'manual',
      quality: 80,
      maxEdge: 0,
      targetSize: 200,
      sizeUnit: 'kib',
    },
    async (values, context) =>
      (await import('./processors/image-compression')).compressImages(values, context),
  ),
  define(
    'video-compress',
    ['视频压缩', 'Video compressor'],
    [
      '本地压缩为 MP4 或 WebM。手动输入视频 / 音频码率，或按目标大小和时长自动计算并校验结果；支持限制分辨率与帧率。',
      'Compress locally as MP4 or WebM. Enter video / audio bitrates, or calculate from target size and duration and verify the output. Supports resolution and frame rate limits.',
    ],
    ['video'],
    [
      files(mediaAccept),
      format(['mp4', 'webm']),
      compressionMode,
      {
        type: 'number',
        name: 'videoBitrate',
        label: b('视频码率（kbps）', 'Video bitrate (kbps)'),
        min: 16,
        max: 100000,
        step: 1,
        visibleWhen: { field: 'compressionMode', value: 'manual' },
      },
      {
        type: 'number',
        name: 'audioBitrate',
        label: b('音频码率（kbps，0 为移除音轨）', 'Audio bitrate (kbps; 0 = remove audio)'),
        min: 0,
        max: 320,
        step: 1,
        visibleWhen: { field: 'compressionMode', value: 'manual' },
      },
      {
        type: 'select',
        name: 'resolution',
        label: b('最大分辨率', 'Maximum resolution'),
        options: ['original', '1080', '720', '480', '360'].map((value) => ({
          value,
          label: value === 'original' ? b('原始尺寸', 'Original') : b(`${value}p`, `${value}p`),
        })),
      },
      {
        type: 'number',
        name: 'frameRate',
        label: b('最大帧率（fps，0 为原始帧率）', 'Maximum frame rate (fps; 0 = original)'),
        min: 0,
        max: 120,
        step: 1,
      },
      ...targetFields,
      {
        type: 'select',
        name: 'targetAudio',
        label: b('目标模式音轨', 'Audio in target mode'),
        visibleWhen: { field: 'compressionMode', value: 'target' },
        options: [
          {
            value: 'keep',
            label: b('保留（自动分配码率）', 'Keep (allocate bitrate automatically)'),
          },
          { value: 'remove', label: b('移除音轨', 'Remove audio') },
        ],
      },
    ],
    {
      files: [],
      format: 'mp4',
      compressionMode: 'manual',
      videoBitrate: 1500,
      audioBitrate: 96,
      resolution: '720',
      frameRate: 0,
      targetSize: 10,
      sizeUnit: 'mib',
      targetAudio: 'keep',
    },
    async (values, context) => (await import('./processors/media')).compressVideo(values, context),
  ),
  define(
    'image-convert',
    ['图片格式转换', 'Image format converter'],
    [
      '批量转换为 PNG、JPG 或 WebP。透明背景转 JPG 时填充白色，动图导出第一帧。',
      'Batch convert to PNG, JPG or WebP. JPEG uses a white background; animations export their first frame.',
    ],
    ['image'],
    [
      files('image/*,.svg,.bmp,.gif,.avif', true),
      format(['png', 'jpg', 'webp']),
      {
        type: 'slider',
        name: 'quality',
        label: b('图片质量', 'Image quality'),
        min: 10,
        max: 100,
        step: 1,
        help: b(
          '仅影响 JPG 和 WebP；原始尺寸保持不变。',
          'Applies to JPG and WebP; dimensions stay the same.',
        ),
      },
    ],
    { files: [], format: 'png', quality: 90 },
    async (values, context) => (await import('./processors/images')).convertImages(values, context),
  ),
  define(
    'video-convert',
    ['视频格式转换', 'Video format converter'],
    [
      '本地转换 MP4、WebM。可用编码取决于浏览器；建议使用新版 Chrome 或 Edge。',
      'Convert to MP4 or WebM locally. Codec availability depends on your browser; use a recent Chrome or Edge.',
    ],
    ['video'],
    [
      files(mediaAccept),
      format(['mp4', 'webm']),
      {
        type: 'select',
        name: 'resolution',
        label: b('最大分辨率', 'Maximum resolution'),
        options: ['original', '1080', '720', '480'].map((value) => ({
          value,
          label: value === 'original' ? b('原始尺寸', 'Original') : b(`${value}p`, `${value}p`),
        })),
      },
    ],
    { files: [], format: 'mp4', resolution: '720' },
    async (values, context) =>
      (await import('./processors/media')).convertMedia(values, context, 'video'),
  ),
  define(
    'video-gif',
    ['视频转 GIF', 'Video to GIF'],
    [
      '将视频片段转换为 GIF 动画，可设置起点、时长、帧率、尺寸和循环。最长 30 秒、输入最多 128 MiB；GIF 不含音轨。',
      'Convert a video clip to animated GIF with start time, duration, frame rate, size and looping. Up to 30 seconds and 128 MiB input; GIF has no audio.',
    ],
    ['video', 'image'],
    [
      files(mediaAccept),
      {
        type: 'number',
        name: 'start',
        label: b('开始时间（秒）', 'Start time (seconds)'),
        min: 0,
        max: 86400,
        step: 0.1,
      },
      {
        type: 'number',
        name: 'duration',
        label: b('片段时长（秒）', 'Clip duration (seconds)'),
        min: 0.1,
        max: 30,
        step: 0.1,
        help: b('到达视频结尾时自动结束。', 'Stops automatically at the end of the video.'),
      },
      {
        type: 'number',
        name: 'fps',
        label: b('帧率（每秒帧数）', 'Frame rate (fps)'),
        min: 1,
        max: 30,
        step: 1,
      },
      gifMaxEdge,
      { type: 'checkbox', name: 'loop', label: b('无限循环', 'Loop forever') },
    ],
    { files: [], start: 0, duration: 5, fps: 10, maxEdge: 480, loop: true },
    async (values, context) =>
      (await import('./processors/gif')).convertGif(values, context, 'video-gif'),
  ),
  define(
    'gif-video',
    ['GIF 转视频', 'GIF to video'],
    [
      '将 GIF 动画转换为 MP4 或 WebM，保留播放节奏，可设置尺寸和透明区域背景色。仅播放一个循环，最长 60 秒、1800 帧，输入最多 128 MiB；无音轨。',
      'Convert animated GIF to MP4 or WebM, preserving timing with size and background options. One cycle, up to 60 seconds, 1800 frames and 128 MiB input; no audio.',
    ],
    ['video', 'image'],
    [
      files('image/gif,.gif'),
      format(['mp4', 'webm']),
      gifMaxEdge,
      {
        type: 'select',
        name: 'background',
        label: b('透明区域背景色', 'Transparent area background'),
        options: [
          { value: 'white', label: b('白色', 'White') },
          { value: 'black', label: b('黑色', 'Black') },
        ],
      },
    ],
    { files: [], format: 'mp4', maxEdge: 480, background: 'white' },
    async (values, context) =>
      (await import('./processors/gif')).convertGif(values, context, 'gif-video'),
  ),
  define(
    'audio-convert',
    ['音频格式转换', 'Audio format converter'],
    [
      '转换为 MP3、WAV、FLAC、M4A / AAC 或 OGG / Opus。WAV / FLAC 保存解码后的音质，M4A / OGG 取决于浏览器编码支持。',
      'Convert to MP3, WAV, FLAC, M4A / AAC or OGG / Opus. WAV / FLAC preserve decoded audio; M4A / OGG require browser encoder support.',
    ],
    ['audio'],
    [
      files(audioAccept),
      format(['mp3', 'wav', 'flac', 'm4a', 'ogg']),
      {
        type: 'select',
        name: 'bitrate',
        label: b('压缩音频比特率', 'Compressed audio bitrate'),
        options: ['96', '128', '192', '256'].map((value) => ({
          value,
          label: b(`${value} kbps`, `${value} kbps`),
        })),
      },
    ],
    { files: [], format: 'wav', bitrate: '192' },
    async (values, context) =>
      (await import('./processors/media')).convertMedia(values, context, 'audio'),
  ),
  define(
    'audio-midi',
    ['音频转 MIDI', 'Audio to MIDI'],
    [
      '支持 MP3、WAV、FLAC、M4A / AAC / ALAC、OGG、Opus、WebM、AIFF 和 WMA，本地识别旋律与和弦生成 MIDI。独奏效果较好，完整歌曲可能需要人工修正；最长 3 分钟。',
      'Transcribe MP3, WAV, FLAC, M4A / AAC / ALAC, OGG, Opus, WebM, AIFF and WMA melodies and chords to MIDI locally. Solo instruments work best; full songs may need editing. Up to 3 minutes.',
    ],
    ['audio'],
    [
      files(midiAudioAccept),
      {
        type: 'slider',
        name: 'sensitivity',
        label: b('音符识别灵敏度', 'Note detection sensitivity'),
        min: 10,
        max: 90,
        step: 1,
        help: b(
          '越高越容易识别弱音，也可能增加误识别。',
          'Higher values detect softer notes but may add false notes.',
        ),
      },
      {
        type: 'number',
        name: 'minDuration',
        label: b('最短音符（毫秒）', 'Minimum note length (milliseconds)'),
        min: 30,
        max: 1000,
        step: 1,
      },
    ],
    { files: [], sensitivity: 65, minDuration: 100 },
    async (values, context) => (await import('./processors/midi')).audioToMidi(values, context),
  ),
  define(
    'midi-audio',
    ['MIDI 转音频', 'MIDI to audio'],
    [
      '本地合成为 MP3、WAV、FLAC、M4A / AAC / ALAC、OGG、Opus、WebM、AIFF 或 WMA，可选择音色。原乐器使用近似合成音色；最长 3 分钟。',
      'Render MIDI locally to MP3, WAV, FLAC, M4A / AAC / ALAC, OGG, Opus, WebM, AIFF or WMA with a choice of approximate synthesized timbres. Up to 3 minutes.',
    ],
    ['audio'],
    [
      files('.mid,.midi,audio/midi,audio/x-midi'),
      {
        type: 'select',
        name: 'format',
        label: b('输出格式', 'Output format'),
        options: Object.keys(midiAudioFormats).map((value) => ({
          value,
          label: b(
            value === 'alac' ? 'M4A / ALAC（无损）' : value.toUpperCase(),
            value === 'alac' ? 'M4A / ALAC (lossless)' : value.toUpperCase(),
          ),
        })),
      },
      {
        type: 'select',
        name: 'bitrate',
        label: b('压缩音频比特率', 'Compressed audio bitrate'),
        options: ['96', '128', '192', '256', '320'].map((value) => ({
          value,
          label: b(`${value} kbps`, `${value} kbps`),
        })),
        help: b(
          'WAV、FLAC、AIFF 和 ALAC 为无损格式，不使用此设置。',
          'WAV, FLAC, AIFF and ALAC are lossless and ignore this setting.',
        ),
      },
      {
        type: 'select',
        name: 'instrument',
        label: b('合成音色', 'Synthesized timbre'),
        options: [
          {
            value: 'original',
            label: b('跟随 MIDI 乐器（近似音色）', 'Follow MIDI instruments (approximate)'),
          },
          { value: 'piano', label: b('钢琴', 'Piano') },
          { value: 'sine', label: b('纯正弦音', 'Sine wave') },
          { value: 'strings', label: b('弦乐', 'Strings') },
        ],
      },
      {
        type: 'select',
        name: 'sampleRate',
        label: b('采样率', 'Sample rate'),
        help: b(
          'Opus 和 WebM 使用 48000 Hz；其他格式使用所选采样率。',
          'Opus and WebM use 48000 Hz; other formats use the selected rate.',
        ),
        options: ['22050', '44100', '48000'].map((value) => ({
          value,
          label: b(`${value} Hz`, `${value} Hz`),
        })),
      },
    ],
    { files: [], format: 'wav', bitrate: '192', instrument: 'original', sampleRate: '44100' },
    async (values, context) => (await import('./processors/midi')).midiToAudio(values, context),
  ),
  define(
    'document-convert',
    ['文档格式转换', 'Document format converter'],
    [
      'PDF、Word（DOCX）、PPT（PPTX）互转，Excel（XLS / XLSX / CSV）与 TXT 可导出为其中任一种。支持文字、表格和图片；复杂排版、图表、公式与动画可能无法完整保留。',
      'Convert PDF, Word (DOCX) and PowerPoint (PPTX). Export Excel (XLS / XLSX / CSV) or TXT to any of them. Text, tables and images are supported; complex layouts, charts, formulas and animations may not be preserved.',
    ],
    ['document'],
    [
      files('.pdf,.docx,.pptx,.xlsx,.xls,.csv,.txt'),
      format(['pdf', 'docx', 'pptx', 'xlsx', 'csv', 'txt', 'html']),
      {
        type: 'select',
        name: 'pdfMode',
        label: b('PDF 转 Word / PPT 的方式', 'PDF to Word / PowerPoint mode'),
        options: [
          {
            value: 'appearance',
            label: b('保留外观（每页为图片）', 'Preserve appearance (page images)'),
          },
          {
            value: 'editable',
            label: b('可编辑文字（重新排版，无 OCR）', 'Editable text (reflowed, no OCR)'),
          },
        ],
        help: b(
          '扫描 PDF 请选保留外观。旧版 DOC / PPT 请先另存为 DOCX / PPTX。导出 XLSX / CSV 会提取内容为单元格。',
          'Use page images for scanned PDFs. Save legacy DOC / PPT as DOCX / PPTX first. XLSX / CSV output extracts content into cells.',
        ),
      },
    ],
    { files: [], format: 'pdf', pdfMode: 'appearance' },
    async (values, context) =>
      (await import('./processors/documents')).convertDocument(values, context),
  ),
  define(
    'images-pdf',
    ['图片转 PDF', 'Images to PDF'],
    [
      '按选择顺序将多张图片合并为 PDF。支持 PNG、JPG、WebP 等浏览器可读取的图片，最多 100 张。',
      'Combine images into a PDF in selection order. Supports PNG, JPG, WebP and other browser-readable images, up to 100 images.',
    ],
    ['image', 'document'],
    [
      files('image/*,.svg,.bmp,.gif,.avif', true),
      {
        type: 'select',
        name: 'pageSize',
        label: b('页面尺寸', 'Page size'),
        options: [
          { value: 'a4', label: b('A4（自动横竖向）', 'A4 (automatic orientation)') },
          { value: 'image', label: b('匹配图片尺寸', 'Match image dimensions') },
        ],
      },
    ],
    { files: [], pageSize: 'a4' },
    async (values, context) =>
      (await import('./processors/images-pdf')).imagesToPdf(values, context),
  ),
  define(
    'video-audio',
    ['音频提取', 'Extract audio'],
    [
      '从视频中提取音轨为 MP3、WAV、FLAC、M4A 或 OGG；可以指定开始时间与时长。',
      'Extract a video soundtrack to MP3, WAV, FLAC, M4A or OGG, with an optional start time and duration.',
    ],
    ['video', 'audio'],
    [
      files(mediaAccept),
      format(['mp3', 'wav', 'flac', 'm4a', 'ogg']),
      {
        type: 'number',
        name: 'start',
        label: b('开始时间（秒）', 'Start time (seconds)'),
        min: 0,
        max: 86400,
        step: 0.1,
      },
      {
        type: 'number',
        name: 'duration',
        label: b('提取时长（秒，0 为直到结尾）', 'Duration (seconds; 0 = to end)'),
        min: 0,
        max: 86400,
        step: 0.1,
      },
    ],
    { files: [], format: 'wav', start: 0, duration: 0 },
    async (values, context) =>
      (await import('./processors/media')).convertMedia(values, context, 'extract'),
  ),
  define(
    'video-frames',
    ['帧提取', 'Extract frames'],
    [
      '按时间间隔提取视频画面，最多 100 帧，打包为 ZIP。仅支持当前浏览器可播放的视频。',
      'Extract frames at a time interval and download up to 100 images as a ZIP. The video must be playable in this browser.',
    ],
    ['video', 'image'],
    [
      files(mediaAccept),
      format(['png', 'jpg', 'webp']),
      {
        type: 'number',
        name: 'start',
        label: b('开始时间（秒）', 'Start time (seconds)'),
        min: 0,
        max: 86400,
        step: 0.1,
      },
      {
        type: 'number',
        name: 'interval',
        label: b('帧间隔（秒）', 'Frame interval (seconds)'),
        min: 0.1,
        max: 3600,
        step: 0.1,
      },
      {
        type: 'number',
        name: 'count',
        label: b('最多提取帧数', 'Maximum frame count'),
        min: 1,
        max: 100,
        step: 1,
      },
    ],
    { files: [], format: 'png', start: 0, interval: 1, count: 10 },
    async (values, context) => (await import('./processors/frames')).extractFrames(values, context),
  ),
  define(
    'share-link',
    ['网盘链接解析', 'Cloud drive link parser'],
    [
      '免登录解析蓝奏云、蓝奏云优享版的公开分享，浏览文件并获取不超过 100 MiB 的小文件直链。',
      'Resolve public Lanzou Cloud and Lanzou Premium shares without login, browse files and get download URLs for files up to 100 MiB.',
    ],
    ['parse'],
    [
      {
        type: 'textarea',
        name: 'text',
        required: true,
        label: b('分享链接或分享文案', 'Share links or share text'),
        placeholder: b(
          '粘贴分享链接，可包含提取码；多个链接请分行。',
          'Paste share links with optional access codes; use one link per line.',
        ),
        help: b(
          '开始处理后，链接与提取码会发送到 lz.qaiu.top 公益解析服务；无需网盘账号。',
          'Processing sends links and access codes to the lz.qaiu.top public resolver; no drive account is needed.',
        ),
      },
      {
        type: 'text',
        name: 'password',
        label: b('提取码（可选）', 'Access code (optional)'),
        help: b(
          '手动填写会覆盖文案和链接中的提取码。',
          'Overrides access codes found in the text or URL.',
        ),
      },
    ],
    { text: '', password: '' },
    async (values, context) =>
      (await import('./processors/share-links')).resolveShareLinks(values, context),
  ),
  define(
    'social-link',
    ['社交平台解析', 'Social platform parser'],
    [
      '识别哔哩哔哩、抖音、快手、X、YouTube、TikTok 的分享链接。解析接口待接入，暂不能获取媒体直链。中国大陆用户需自备代理。',
      'Identify Bilibili, Douyin, Kuaishou, X, YouTube and TikTok share links. Resolver API pending; media URLs are not available yet. Users in mainland China need their own proxy.',
    ],
    ['video', 'parse'],
    [
      {
        type: 'textarea',
        name: 'text',
        required: true,
        label: b('视频或帖子链接 / 分享文案', 'Video or post links / share text'),
        placeholder: b(
          '粘贴六个平台的视频或帖子链接，多个链接可分行。',
          'Paste video or post links from the six platforms, one per line.',
        ),
        help: b(
          '中国大陆用户需自备代理。26.2.0 仅提供链接识别，解析接口待接入；当前不会发送分享链接到解析服务。',
          'Users in mainland China need their own proxy. 26.2.0 provides link identification; resolver API pending. Links are currently not sent to a resolver.',
        ),
      },
    ],
    { text: '' },
    async (values, context) =>
      (await import('./processors/social-links')).resolveSocialLinks(values, context),
  ),
  define(
    'archive-unlock',
    ['压缩包密码恢复', 'Archive password recovery'],
    [
      '恢复 ZIP（ZipCrypto / AES）密码并输出无密码 ZIP。支持已知密码、常见密码、字典和限定范围穷举；不能保证破解强密码，暂不支持 RAR / 7Z。',
      'Recover ZIP (ZipCrypto / AES) passwords and export an unlocked ZIP. Try a known password, common passwords, a dictionary or a bounded brute-force search. Strong passwords may not be recovered; RAR / 7Z are not supported yet.',
    ],
    ['other'],
    [
      files('.zip,application/zip'),
      {
        type: 'select',
        name: 'mode',
        label: b('恢复方式', 'Recovery method'),
        options: [
          {
            value: 'auto',
            label: b(
              '一键恢复（常见密码 + 1–4 位数字）',
              'One-click recovery (common passwords + 1–4 digits)',
            ),
          },
          { value: 'known', label: b('使用已知密码', 'Use a known password') },
          { value: 'dictionary', label: b('自定义字典', 'Custom dictionary') },
          { value: 'brute', label: b('限定范围穷举', 'Bounded brute force') },
        ],
      },
      {
        type: 'text',
        name: 'password',
        label: b('已知密码或优先尝试的密码', 'Known password or first guess'),
      },
      {
        type: 'textarea',
        name: 'dictionary',
        label: b('候选密码（每行一个）', 'Candidate passwords (one per line)'),
        help: b(
          '不会上传文件或密码。输入的空格属于密码。',
          'Files and passwords stay local. Spaces are part of the password.',
        ),
      },
      {
        type: 'text',
        name: 'charset',
        label: b('穷举字符集', 'Brute-force character set'),
        help: b(
          '只在限定范围穷举时使用，最多 64 个不同字符。',
          'Used in brute-force mode; at most 64 distinct characters.',
        ),
      },
      {
        type: 'number',
        name: 'minLength',
        label: b('最短密码长度', 'Minimum password length'),
        min: 1,
        max: 8,
        step: 1,
      },
      {
        type: 'number',
        name: 'maxLength',
        label: b('最长密码长度', 'Maximum password length'),
        min: 1,
        max: 8,
        step: 1,
      },
      {
        type: 'number',
        name: 'maxAttempts',
        label: b('最多尝试次数', 'Attempt limit'),
        min: 1,
        max: 1000000,
        step: 1,
        help: b(
          '达到次数上限就停止，可以随时取消。AES 恢复可能较慢。',
          'Stops at this limit; cancel at any time. AES recovery can be slow.',
        ),
      },
    ],
    {
      files: [],
      mode: 'auto',
      password: '',
      dictionary: '',
      charset: '0123456789',
      minLength: 1,
      maxLength: 4,
      maxAttempts: 20000,
    },
    async (values, context) =>
      (await import('./processors/archive')).recoverArchive(values, context),
  ),
]
