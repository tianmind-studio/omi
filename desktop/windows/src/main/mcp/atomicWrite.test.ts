import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { atomicWriteFileSync } from './atomicWrite'

const dir = mkdtempSync(join(tmpdir(), 'atomic-write-test-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('atomicWriteFileSync', () => {
  it('writes data and round-trips it', () => {
    const p = join(dir, 'a.json')
    atomicWriteFileSync(p, '{"x":1}')
    expect(readFileSync(p, 'utf8')).toBe('{"x":1}')
  })

  it('overwrites an existing file', () => {
    const p = join(dir, 'b.txt')
    writeFileSync(p, 'old', 'utf8')
    atomicWriteFileSync(p, 'new')
    expect(readFileSync(p, 'utf8')).toBe('new')
  })

  it('leaves NO temp file behind after a successful write', () => {
    const p = join(dir, 'c.txt')
    atomicWriteFileSync(p, 'hi')
    const temps = readdirSync(dir).filter((f) => f.includes('.omi-tmp-'))
    expect(temps).toEqual([])
  })

  it('on a failing write (missing parent dir) it throws and leaves no partial file', () => {
    const p = join(dir, 'does', 'not', 'exist', 'd.txt')
    expect(() => atomicWriteFileSync(p, 'x')).toThrow()
    expect(existsSync(p)).toBe(false)
    const temps = readdirSync(dir).filter((f) => f.includes('.omi-tmp-'))
    expect(temps).toEqual([])
  })

  it('round-trips multi-byte UTF-8 (CJK, emoji, accented) without BOM or corruption', () => {
    const content = '{"greeting":"你好世界","emoji":"🎉🚀","accents":"café naïve"}'
    const p = join(dir, 'unicode.json')
    atomicWriteFileSync(p, content)
    const raw = readFileSync(p)
    expect(raw[0]).not.toBe(0xef)
    expect(readFileSync(p, 'utf8')).toBe(content)
  })

  it('preserves astral-plane characters (surrogate pairs in UTF-16, 4-byte in UTF-8)', () => {
    const content = '𝄞 𝕳𝖊𝖑𝖑𝖔 𝟙𝟚𝟛'
    const p = join(dir, 'astral.txt')
    atomicWriteFileSync(p, content)
    expect(readFileSync(p, 'utf8')).toBe(content)
  })
})
