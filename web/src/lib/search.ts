const replacements: [RegExp, string][] = [
  [/jpeg/g, 'jpg'],
  [/powerpoint|\bppt\b/g, 'pptx'],
  [/\bword\b/g, 'docx'],
  [/excel|\bxls\b/g, 'xlsx'],
  [
    /格式转换|格式转化|格式转|转换格式|转换|转化|转为|转成|转到|转|convert(?:er|ing)?|conversion|\bto\b|->|→/g,
    ' convert ',
  ],
  [/图片|图像|images?/g, ' image '],
  [/视频|videos?/g, ' video '],
  [/音频|声音|audio/g, ' audio '],
  [/提取|extract(?:ion|ing)?/g, ' extract '],
  [/文档|documents?/g, ' document '],
  [/压缩包|archive|zip/g, ' zip '],
  [/压缩|compress(?:or|ion|ing)?|减小|缩小/g, ' compress '],
  [/解密|破解|密码恢复|解锁|unlock|decrypt|recover(?:y)?/g, ' unlock '],
  [/帧|frames?/g, ' frame '],
  [/设置|settings?/g, ' settings '],
  [/模糊|fuzzy/g, ' fuzzy '],
  [/格式|formats?/g, ' format '],
  [/把|帮我|请|我要|我想|一个|文件|\b(?:a|an|the|file|files|into|from)\b/g, ' '],
]
export function normalizeSearch(text: string) {
  let result = text.normalize('NFKC').toLowerCase()
  for (const [pattern, replacement] of replacements) result = result.replace(pattern, replacement)
  return result
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}
function distance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let row = 1; row <= a.length; row++) {
    const current = [row]
    for (let column = 1; column <= b.length; column++)
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1),
      )
    previous = current
  }
  return previous[b.length]
}
export function searchScore(query: string, text: string) {
  const needle = normalizeSearch(query)
  if (!needle) return 1
  const haystack = normalizeSearch(text)
  if (haystack === needle) return 100
  if (haystack.includes(needle)) return 80
  const words = haystack.split(' ')
  let score = 0
  for (const token of [...new Set(needle.split(' '))]) {
    if (words.includes(token)) score += 12
    else if (words.some((word) => word.includes(token))) score += 8
    else if (
      token.length >= 3 &&
      words.some((word) => distance(token, word) <= (token.length >= 7 ? 2 : 1))
    )
      score += 4
    else return 0
  }
  return score
}

export const toolSearchAliases: Record<string, string> = {
  'image-compress': 'image compress jpg jpeg png webp quality target size 图片压缩 质量 目标大小',
  'video-compress': 'video compress mp4 webm bitrate target size 视频压缩 码率 目标大小',
  'image-convert': 'image format convert png jpg jpeg webp bmp gif svg avif 图片格式转换',
  'video-convert': 'video format convert mp4 webm mov mkv m4v 视频格式转换',
  'video-gif': 'video convert gif mp4 webm mov mkv clip animation 视频转GIF 动图 片段',
  'gif-video': 'gif convert video mp4 webm animation GIF转视频 动图',
  'audio-convert': 'audio format convert mp3 wav flac aac m4a ogg opus 音频格式转换',
  'audio-midi':
    'audio convert midi transcription mp3 wav flac m4a aac alac ogg opus webm aiff aif wma piano notes melody 音频转MIDI 音乐 旋律 和弦',
  'midi-audio':
    'midi convert audio mid mp3 wav flac m4a aac alac ogg opus webm aiff aif wma synth render MIDI转音频 合成',
  'share-link':
    'cloud drive share link parse resolver yunx lanzou ilanzou anonymous 网盘 链接 解析 提取码 蓝奏 优享 免登录 云析',
  'social-link':
    'social platform video parse resolver bilibili douyin kuaishou twitter x youtube tiktok 社交 平台 视频 解析 哔哩哔哩 抖音 快手 代理',
  'document-convert':
    'document format convert pdf docx word ppt pptx powerpoint excel xlsx xls csv txt html 文档格式转换',
  'images-pdf': 'image pdf convert png jpg jpeg webp svg bmp avif combine merge 图片转PDF 多图合并',
  'video-audio':
    'video audio extract soundtrack mp4 webm mov mkv wav m4a ogg 视频音频提取 音轨 导出声音',
  'video-frames': 'video frame extract screenshot mp4 webm mov mkv png jpg webp 视频帧提取 截图',
  'archive-unlock':
    'archive zip unlock password recovery decrypt brute force dictionary 压缩包解密 破解密码 密码恢复 字典 穷举',
}
