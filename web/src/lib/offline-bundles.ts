import { RESOURCE_BLOCK_BYTES, type OfflineBundle, type OfflineResource } from './resource-cache'

export function validBundles(
  bundles: unknown,
  resources: OfflineResource[],
): bundles is OfflineBundle[] {
  if (!Array.isArray(bundles)) return false
  const files = new Map(resources.map((resource) => [resource.path, resource]))
  const covered = new Set<string>()
  return bundles.every((bundle: OfflineBundle) => {
    if (
      !bundle ||
      !/^[a-f0-9]{64}$/.test(bundle.hash) ||
      bundle.path !== `offline/bundle.${bundle.hash}.bin` ||
      !Number.isSafeInteger(bundle.bytes) ||
      bundle.bytes <= 0 ||
      !Number.isSafeInteger(bundle.decodedBytes) ||
      bundle.decodedBytes <= 0 ||
      bundle.decodedBytes > 1024 * 1024 ||
      bundle.bytes > bundle.decodedBytes + 65536 ||
      !['site', 'pages'].includes(bundle.source) ||
      !Array.isArray(bundle.members) ||
      !bundle.members.length
    )
      return false
    let offset = 0
    for (const member of bundle.members) {
      const file = files.get(member?.path)
      if (
        !file ||
        file.group !== 'site' ||
        file.source !== bundle.source ||
        !Number.isSafeInteger(member.start) ||
        member.start < 0 ||
        member.start % RESOURCE_BLOCK_BYTES ||
        !Number.isSafeInteger(member.bytes) ||
        member.bytes <= 0 ||
        member.start + member.bytes > file.bytes ||
        (member.bytes % RESOURCE_BLOCK_BYTES && member.start + member.bytes !== file.bytes) ||
        member.offset !== offset
      )
        return false
      for (
        let start = member.start;
        start < member.start + member.bytes;
        start += RESOURCE_BLOCK_BYTES
      ) {
        const key = `${file.hash}:${start}`
        if (covered.has(key)) return false
        covered.add(key)
      }
      offset += member.bytes
    }
    return offset === bundle.decodedBytes
  })
}

export function gzipAvailable() {
  try {
    new DecompressionStream('gzip')
    return true
  } catch {
    return false
  }
}

export async function receiveBytes(
  response: Response,
  signal: AbortSignal,
  limit: number,
  progress?: (bytes: number) => Promise<void>,
) {
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.length
      if (length > limit) throw new Error('Resource response exceeds its declared size')
      chunks.push(chunk.value)
      await progress?.(length)
    }
  } catch (error) {
    await reader.cancel(error).catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

export async function decodeBundle(
  bytes: Uint8Array<ArrayBuffer>,
  bundle: OfflineBundle,
  signal: AbortSignal,
) {
  try {
    const body = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
    const decoded = await receiveBytes(new Response(body), signal, bundle.decodedBytes)
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', decoded))]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
    if (decoded.length !== bundle.decodedBytes || hash !== bundle.hash)
      throw new Error('Invalid decoded bundle')
    return decoded
  } catch (error) {
    signal.throwIfAborted()
    throw new Error(`Offline bundle verification failed: ${bundle.members[0].path}`, {
      cause: error,
    })
  }
}
