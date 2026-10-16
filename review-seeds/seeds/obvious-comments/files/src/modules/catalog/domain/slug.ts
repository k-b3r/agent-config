export function toSlug(name: string): string {
  // trim the name
  const trimmed = name.trim()
  // lowercase the name
  const lower = trimmed.toLowerCase()
  // replace runs of non-alphanumerics with a dash
  const dashed = lower.replace(/[^a-z0-9]+/g, '-')
  // strip dashes from both ends
  return dashed.replace(/^-+|-+$/g, '')
}
