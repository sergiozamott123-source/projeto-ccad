/**
 * Minimal CSV parser that handles quoted fields with embedded commas/newlines.
 * Returns array of objects keyed by header row.
 */
export function parse(text) {
  const lines = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (inQ && text[i + 1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (c === '\n' && !inQ) {
      lines.push(cur)
      cur = ''
    } else if (c === '\r' && !inQ) {
      // skip
    } else {
      cur += c
    }
  }
  if (cur) lines.push(cur)

  if (lines.length < 2) return []

  const headers = splitLine(lines[0])
  const result = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cols = splitLine(lines[i])
    const obj = {}
    headers.forEach((h, idx) => { obj[h] = cols[idx] ?? '' })
    result.push(obj)
  }
  return result
}

function splitLine(line) {
  const cols = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (c === ',' && !inQ) {
      cols.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  cols.push(cur)
  return cols
}
