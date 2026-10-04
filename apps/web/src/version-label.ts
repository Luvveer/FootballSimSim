// The 23 and 24 releases are named EA Sports FC; every earlier release keeps the FIFA name.
export function versionLabel(version: string): string {
  const v = version.trim().replace(/\.0+$/, '')
  if (/^(fifa|fc)/i.test(v)) return v
  return v === '23' || v === '24' ? `FC ${v}` : `FIFA ${v}`
}
