const MULTIMODAL_MODEL_PATTERNS = [
  /\bgpt-4o\b/,
  /\bgpt-4\.1\b/,
  /\bgpt-4-vision\b/,
  /\bgpt-4-turbo\b/,
  /\bo4-mini\b/,
  /\bchatgpt-4o\b/,
  /\bqwen[-_]?.*vl\b/,
  /\bqvq\b/,
  /\bglm[-_]?.*v\b/,
  /\binternvl\b/,
  /\bllava\b/,
  /\bminicpm[-_]?.*v\b/,
  /\bpixtral\b/,
  /\bgemini\b/,
  /\bclaude-3\b/,
  /\bclaude-4\b/,
  /vision/,
  /multimodal/,
]

export function isLikelyMultimodalModel(modelName?: string | null): boolean {
  const normalized = (modelName || '').trim().toLowerCase()
  if (!normalized) return false
  return MULTIMODAL_MODEL_PATTERNS.some(pattern => pattern.test(normalized))
}

export function disableVisionFormats(formats: string[]): string[] {
  return formats.filter(format => format !== 'screenshot')
}
