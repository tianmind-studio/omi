import { describe, it, expect } from 'vitest'
import { formatMemoriesMarkdown } from './format'

describe('formatMemoriesMarkdown', () => {
  const at = new Date('2026-06-03T12:00:00Z')

  it('renders a title, export stamp, and category groups', () => {
    const md = formatMemoriesMarkdown(
      [
        { content: 'Has two cats', category: 'Personal' },
        { content: 'Prefers TypeScript', category: 'Work' },
        { content: 'Lives in Seattle', category: 'Personal' }
      ],
      at
    )
    expect(md).toBe(
      `# Omi Memories

_Exported 2026-06-03 · 3 memories_

## Personal

- Has two cats
- Lives in Seattle

## Work

- Prefers TypeScript
`
    )
  })

  it('falls back to "Other" when category is missing', () => {
    const md = formatMemoriesMarkdown([{ content: 'No category here' }], at)
    expect(md).toContain('## Other')
    expect(md).toContain('- No category here')
    expect(md).toContain('· 1 memory_')
  })

  it('collapses newlines inside a memory into one bullet', () => {
    const md = formatMemoriesMarkdown([{ content: 'line one\n  line two' }], at)
    expect(md).toContain('- line one line two')
  })

  it('preserves CJK and emoji in content and categories', () => {
    const md = formatMemoriesMarkdown(
      [
        { content: '喜欢喝咖啡 ☕', category: '个人' },
        { content: '日本語を勉強中 📚', category: '学習' }
      ],
      at
    )
    expect(md).toContain('## 个人')
    expect(md).toContain('- 喜欢喝咖啡 ☕')
    expect(md).toContain('## 学習')
    expect(md).toContain('- 日本語を勉強中 📚')
  })

  it('handles astral-plane characters (4-byte UTF-8)', () => {
    const md = formatMemoriesMarkdown([{ content: '𝄞 music notation 𝕳𝖊𝖑𝖑𝖔' }], at)
    expect(md).toContain('- 𝄞 music notation 𝕳𝖊𝖑𝖑𝖔')
  })
})
