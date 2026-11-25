import { describe, expect, it } from 'vitest'
import { kgmV2Cipher } from './kugou-v2'

// Independent known outputs from the MIT MyKgmWasm/OpenConverter reference.
const vectors = [
  {
    offset: 0,
    vpr: false,
    hex: '0b949a3b7a5e67a5e03236f8f561121e9c044f237744124111067860a49bd5ce',
  },
  {
    offset: 271,
    vpr: false,
    hex: '63832e125dc2f4ff4b1898ae9e7dfb9ae0347ee765cfce8a8fa98ca0260c017d',
  },
  {
    offset: 272,
    vpr: false,
    hex: '1a858b2a6b4f76b4f12327e9e470030fad357e12467523702037495195aae4ff',
  },
  {
    offset: 4194291,
    vpr: false,
    hex: '9d4f86d005dd5ca071e7858bc8c5dfc66abf33a868a74924e0b3ab73f93f1816',
  },
  {
    offset: 4194311,
    vpr: false,
    hex: '24fb055814677fc7c573445afd3c7749dc163f0df0b60be95d62fe9d2d7f0039',
  },
  {
    offset: 268435424,
    vpr: false,
    hex: '142eed592f64ec3bdb73c1c660e98d12841bf554151128ca8f3d39979a0e5d51',
  },
  { offset: 0, vpr: true, hex: '2e4b729d0f4012abcfb2c5d54dd7f10f9c2190cbd1310c341f29f8938923632d' },
  {
    offset: 271,
    vpr: true,
    hex: '63a6f1fafbb7ea8a4537185db3c54d79f1345b388d69bb94faa7a320d521b9cb',
  },
  {
    offset: 272,
    vpr: true,
    hex: '3f5a638c1e5103badea3d4c45cc6e01ead10a1fae0003d052e18c9a2b812521c',
  },
  {
    offset: 4194291,
    vpr: true,
    hex: 'b8906e7670c329ae5e6776a670733cd76a9aec40ced25751ee9c2b80d487aef5',
  },
  {
    offset: 4194311,
    vpr: true,
    hex: '828e1b2d1a48ff34e8cbf2b9ec3c529634b04a1385b82469ae4f462bce6e001c',
  },
  {
    offset: 268435424,
    vpr: true,
    hex: 'cbc64b2c3111e2145b80ec7ed60a9c12a1c41df2600f5dc4a0bdcaba22b8be40',
  },
]

describe('legacy Kugou decoder compatibility', () => {
  it.each(vectors)('matches the reference at $offset, VPR=$vpr', ({ offset, vpr, hex }) => {
    const header = new Uint8Array(60)
    for (let i = 0; i < 16; i++) header[0x1c + i] = i * 11
    const input = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 255)
    const decode = kgmV2Cipher(header, vpr)
    decode(input.subarray(0, 13), offset)
    decode(input.subarray(13), offset + 13)
    expect(Array.from(input, (byte) => byte.toString(16).padStart(2, '0')).join('')).toBe(hex)
  })
})
