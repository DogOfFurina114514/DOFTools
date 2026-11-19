# FFmpeg WebAssembly runtime

The unmodified `@ffmpeg/core` 0.12.10 single-thread ESM runtime is distributed in
`runtime/ffmpeg/`. FFmpeg and the linked codec libraries retain their own licenses;
this upstream build enables GPL codecs and is GPL-2.0-or-later. This distribution
uses the GPL-3.0 option. It is loaded as a
separate runtime in a worker. The toolbox's original source remains Apache-2.0.

Corresponding sources, licenses and build scripts are available through the
source manifest below. GPL-3.0 section 6(d) permits equivalent access on another
server; all source locations are public, without payment or authentication.
Cached upstream source archives and the complete manifest are available at:

https://github.com/DogOfFurina114514/DOFTools/tree/main/documentation/third-party/ffmpeg

The wrapper/build source archive is:

https://github.com/DogOfFurina114514/DOFTools/blob/main/documentation/third-party/ffmpeg-wasm-0.12.10.tar.gz

Upstream release commit: `71aa99d37c02a7b4c435275ca9ef50e612f6efa1`.
The source manifest records cached archive hashes and pinned upstream references.
All linked source trees include their copyright and license files. Sources not
cached in this repository are available at the explicit upstream locations in
the table below. Extract the build archive, use the included Dockerfile/build
scripts and Emscripten 3.1.40, and build the single-thread target with `FFMPEG_ST=1`.
The archives can replace the Dockerfile's Git ADD sources for an offline rebuild.
Users may modify or replace `runtime/ffmpeg/ffmpeg-core.js` and `.wasm`; the project
imposes no restriction on reverse engineering for debugging library changes.

Upstream source and build documentation:
https://github.com/ffmpegwasm/ffmpeg.wasm/tree/71aa99d37c02a7b4c435275ca9ef50e612f6efa1

FFmpeg license text: `FFmpeg-GPLv3.txt` (the upstream GPL-2.0 text is retained in
`FFmpeg-GPLv2.txt`). Generated output audio is not covered by the runtime license.

| Component | Version / reference | Complete source |
| --- | --- | --- |
| ffmpegwasm/x264 | 4-cores | [Source tree](https://github.com/ffmpegwasm/x264/tree/33cac6b77d5b9259c552156013a817ab23119612) / [Download archive](https://codeload.github.com/ffmpegwasm/x264/tar.gz/33cac6b77d5b9259c552156013a817ab23119612) |
| ffmpegwasm/x265 | 3.4 | [Source tree](https://github.com/ffmpegwasm/x265/tree/3.4) / [Download archive](https://codeload.github.com/ffmpegwasm/x265/tar.gz/3.4) |
| ffmpegwasm/libvpx | v1.13.1 | [Source tree](https://github.com/ffmpegwasm/libvpx/tree/v1.13.1) / [Download archive](https://codeload.github.com/ffmpegwasm/libvpx/tar.gz/v1.13.1) |
| ffmpegwasm/lame | master | [Source tree](https://github.com/ffmpegwasm/lame/tree/2badea1974ae36cb8312afe99cff1e6b3b5decee) / [Download archive](https://codeload.github.com/ffmpegwasm/lame/tar.gz/2badea1974ae36cb8312afe99cff1e6b3b5decee) |
| ffmpegwasm/Ogg | v1.3.4 | [Source tree](https://github.com/ffmpegwasm/Ogg/tree/v1.3.4) / [Download archive](https://codeload.github.com/ffmpegwasm/Ogg/tar.gz/v1.3.4) |
| ffmpegwasm/theora | v1.1.1 | [Source tree](https://github.com/ffmpegwasm/theora/tree/v1.1.1) / [Download archive](https://codeload.github.com/ffmpegwasm/theora/tar.gz/v1.1.1) |
| ffmpegwasm/opus | v1.3.1 | [Source tree](https://github.com/ffmpegwasm/opus/tree/v1.3.1) / [Download archive](https://codeload.github.com/ffmpegwasm/opus/tar.gz/v1.3.1) |
| ffmpegwasm/vorbis | v1.3.3 | [Source tree](https://github.com/ffmpegwasm/vorbis/tree/v1.3.3) / [Download archive](https://codeload.github.com/ffmpegwasm/vorbis/tar.gz/v1.3.3) |
| ffmpegwasm/zlib | v1.2.11 | [Source tree](https://github.com/ffmpegwasm/zlib/tree/v1.2.11) / [Download archive](https://codeload.github.com/ffmpegwasm/zlib/tar.gz/v1.2.11) |
| ffmpegwasm/libwebp | v1.3.2 | [Source tree](https://github.com/ffmpegwasm/libwebp/tree/ca332209cb5567c9b249c86788cb2dbf8847e760) / [Download archive](https://codeload.github.com/ffmpegwasm/libwebp/tar.gz/ca332209cb5567c9b249c86788cb2dbf8847e760) |
| ffmpegwasm/freetype2 | VER-2-10-4 | [Source tree](https://github.com/ffmpegwasm/freetype2/tree/VER-2-10-4) / [Download archive](https://codeload.github.com/ffmpegwasm/freetype2/tar.gz/VER-2-10-4) |
| fribidi/fribidi | v1.0.9 | [Source tree](https://github.com/fribidi/fribidi/tree/f9e8e71a6fbf4a4619481284c9f484d10e559995) / [Download archive](https://codeload.github.com/fribidi/fribidi/tar.gz/f9e8e71a6fbf4a4619481284c9f484d10e559995) |
| harfbuzz/harfbuzz | 5.2.0 | [Source tree](https://github.com/harfbuzz/harfbuzz/tree/5.2.0) / [Download archive](https://codeload.github.com/harfbuzz/harfbuzz/tar.gz/5.2.0) |
| libass/libass | 0.15.0 | [Source tree](https://github.com/libass/libass/tree/0.15.0) / [Download archive](https://codeload.github.com/libass/libass/tar.gz/0.15.0) |
| sekrit-twc/zimg | release-3.0.5 | [Source tree](https://github.com/sekrit-twc/zimg/tree/release-3.0.5) / [Download archive](https://codeload.github.com/sekrit-twc/zimg/tar.gz/release-3.0.5) |
| FFmpeg/FFmpeg | n5.1.4 | [Source tree](https://github.com/FFmpeg/FFmpeg/tree/n5.1.4) / [Download archive](https://codeload.github.com/FFmpeg/FFmpeg/tar.gz/n5.1.4) |
| libsdl-org/SDL | release-2.24.2 | [Source tree](https://github.com/libsdl-org/SDL/tree/release-2.24.2) / [Download archive](https://codeload.github.com/libsdl-org/SDL/tar.gz/release-2.24.2) |

The SDL2 source version is pinned by Emscripten 3.1.40 `tools/ports/sdl2.py`.
