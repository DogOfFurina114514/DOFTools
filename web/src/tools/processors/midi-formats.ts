export const midiAudioFormats = {
  wav: { extension: 'wav', mime: 'audio/wav', codec: 'pcm_s16le' },
  mp3: { extension: 'mp3', mime: 'audio/mpeg', codec: 'libmp3lame' },
  flac: { extension: 'flac', mime: 'audio/flac', codec: 'flac' },
  m4a: { extension: 'm4a', mime: 'audio/mp4', codec: 'aac' },
  aac: { extension: 'aac', mime: 'audio/aac', codec: 'aac' },
  ogg: { extension: 'ogg', mime: 'audio/ogg', codec: 'libvorbis' },
  opus: { extension: 'opus', mime: 'audio/ogg', codec: 'libopus' },
  webm: { extension: 'webm', mime: 'audio/webm', codec: 'libopus' },
  aiff: { extension: 'aiff', mime: 'audio/aiff', codec: 'pcm_s16be' },
  wma: { extension: 'wma', mime: 'audio/x-ms-wma', codec: 'wmav2' },
  alac: { extension: 'm4a', mime: 'audio/mp4', codec: 'alac' },
} as const

export type MidiAudioFormat = keyof typeof midiAudioFormats
export const midiAudioAccept =
  'audio/*,.mp3,.wav,.wave,.flac,.m4a,.aac,.ogg,.oga,.opus,.webm,.aiff,.aif,.aifc,.wma,.alac,.mp4'
