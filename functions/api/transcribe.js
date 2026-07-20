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
    const mode = new URL(request.url).searchParams.get('mode') === 'song' ? 'song' : 'speech'
    const lyricPrompts = {
      zh: '这是中文歌曲。请按演唱顺序完整转写所有中文歌词，不要翻译，不要改写，不要跳过重复句。',
      yue: '這是粵語歌曲。請按演唱順序完整轉寫所有粵語歌詞，不要翻譯，不要改寫，不要跳過重複句。',
      en: 'This is an English song. Transcribe every sung English lyric in order. Do not translate, summarize, or skip repeated lines.',
      ja: 'これは日本語の歌です。歌われた日本語の歌詞を順番どおり完全に書き起こし、翻訳や要約をしないでください。',
      ko: '이것은 한국어 노래입니다. 부른 한국어 가사를 순서대로 빠짐없이 받아쓰고 번역하거나 요약하지 마세요.',
    }
    const input = mode === 'song'
      ? {
          audio: toBase64(audio),
          task: 'transcribe',
          vad_filter: false,
          condition_on_previous_text: true,
          no_speech_threshold: 0.9,
          log_prob_threshold: -2,
          compression_ratio_threshold: 3,
          beam_size: 8,
          ...(lyricPrompts[language] ? { initial_prompt: lyricPrompts[language] } : {}),
        }
      : { audio: toBase64(audio), task: 'transcribe', vad_filter: true, condition_on_previous_text: true }
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

export function onRequestGet() {
  return Response.json({ ok: true, service: 'soundcut-transcription', ai: 'configured-at-runtime' })
}
