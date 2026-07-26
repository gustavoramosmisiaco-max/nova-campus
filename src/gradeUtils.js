export function getLetterGrade(score) {
  if (score == null) return ''
  if (score >= 18) return 'AD'
  if (score >= 14) return 'A'
  if (score >= 11) return 'B'
  return 'C'
}

export function getLetterColor(score) {
  if (score == null) return 'text-slate-400'
  if (score >= 18) return 'text-emerald-400'
  if (score >= 14) return 'text-emerald-300'
  if (score >= 11) return 'text-yellow-400'
  return 'text-red-400'
}