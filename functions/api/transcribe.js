const MAX_CHUNK_BYTES = 25 * 1024 * 1024

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.AI) return Response.json({ error: 'Workers AI binding 未配置' }, { status: 503 })
    const length = Number(request.headers.get('content-length') || 0)
    if (length > MAX_CHUNK_BYTES) return Response.json({ error: '音频片段过大' }, { status: 413 })
    const audio = await request.arrayBuffer()
    if (!audio.byteLength) return Response.json({ error: '没有收到音频数据' }, { status: 400 })
    if (audio.byteLength > MAX_CHUNK_BYTES) return Response.json({ error: '音频片段过大' }, { status: 413 })
    const language = new URL(request.url).searchParams.get('language') || 'auto'
    const input = { audio: toBase64(audio), task: 'transcribe', vad_filter: true, condition_on_previous_text: true }
    if (language !== 'auto') input.language = language
    const result = await env.AI.run('@cf/openai/whisper-large-v3-turbo', input)
    return Response.json({
      text: result.text || result.transcription_info?.text || '',
      vtt: result.vtt || result.transcription_info?.vtt || '',
      segments: result.segments || result.transcription_info?.segments || [],
      transcription_info: result.transcription_info || null,
    })
  } catch (error) {
    console.error('Transcription failed', error)
    return Response.json({ error: '识别失败，请稍后重试或缩短音频' }, { status: 500 })
  }
}

export function onRequest() {
  return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } })
}
