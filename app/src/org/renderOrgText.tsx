import type { ReactNode } from 'react'

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

export interface OrgRenderOptions {
  /** Called when the reader clicks an `id:` link. */
  onNavigateToId: (id: string) => void
  /** Node id -> title lookup, used to label bare `[[id:...]]` links. */
  resolveTitle: (id: string) => string | undefined
}

/**
 * A deliberately lightweight org-mode text renderer: enough structure
 * (headings, links, basic emphasis) to make note previews legible and
 * navigable, without pulling in the full uniorg/unified/rehype pipeline
 * the old project used. That heavier pipeline (LaTeX, code-block syntax
 * highlighting, images, footnotes) is a documented follow-up, not
 * something this needs to match yet -- see the project's visual roadmap.
 */
export function renderOrgText(raw: string, options: OrgRenderOptions): ReactNode[] {
  const withoutDrawers = stripDrawers(raw)
  const lines = withoutDrawers.split('\n')
  const blocks: ReactNode[] = []
  let paragraphLines: string[] = []
  let key = 0

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return
    const text = paragraphLines.join('\n').trim()
    paragraphLines = []
    if (!text) return
    blocks.push(
      <p key={key++} className="whitespace-pre-wrap leading-relaxed">
        {renderInline(text, options)}
      </p>,
    )
  }

  for (const line of lines) {
    if (isSkippableLine(line)) continue

    const heading = /^(\*+)\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      const level = Math.min(heading[1].length, 6)
      const text = stripTodoAndPriority(heading[2])
      const Tag = HEADING_TAGS[level - 1]
      blocks.push(
        <Tag key={key++} className="mt-3 mb-1 font-semibold first:mt-0">
          {renderInline(text, options)}
        </Tag>,
      )
      continue
    }

    if (line.trim() === '') {
      flushParagraph()
      continue
    }

    paragraphLines.push(line)
  }
  flushParagraph()

  return blocks
}

function stripDrawers(raw: string): string {
  return raw.replace(/^\s*:[A-Za-z_-]+:\s*\n(?:.*\n)*?\s*:END:\s*\n?/gim, '')
}

function isSkippableLine(line: string): boolean {
  const trimmed = line.trim()
  return (
    trimmed.startsWith('#+') ||
    /^(SCHEDULED|DEADLINE|CLOSED):/.test(trimmed)
  )
}

function stripTodoAndPriority(headingText: string): string {
  return headingText.replace(/^(TODO|NEXT|DONE|WAITING|CANCELLED|CANCELED)\s+/, '').replace(/^\[#[A-Z]\]\s+/, '')
}

const INLINE_PATTERN =
  /\[\[(?<linkTarget>[^\]]+)\](?:\[(?<linkDesc>[^\]]*)\])?\]|\*(?<bold>[^*\n]+)\*|\/(?<italic>[^/\n]+)\/|~(?<code1>[^~\n]+)~|=(?<code2>[^=\n]+)=|_(?<underline>[^_\n]+)_/g

function renderInline(text: string, options: OrgRenderOptions): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let key = 0
  const pattern = new RegExp(INLINE_PATTERN)
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const groups = match.groups ?? {}

    if (groups.linkTarget !== undefined) {
      nodes.push(renderLink(groups.linkTarget, groups.linkDesc, options, key++))
    } else if (groups.bold !== undefined) {
      nodes.push(<strong key={key++}>{groups.bold}</strong>)
    } else if (groups.italic !== undefined) {
      nodes.push(<em key={key++}>{groups.italic}</em>)
    } else if (groups.code1 !== undefined) {
      nodes.push(
        <code key={key++} className="rounded bg-white/10 px-1 py-0.5 text-[0.9em]">
          {groups.code1}
        </code>,
      )
    } else if (groups.code2 !== undefined) {
      nodes.push(
        <code key={key++} className="rounded bg-white/10 px-1 py-0.5 text-[0.9em]">
          {groups.code2}
        </code>,
      )
    } else if (groups.underline !== undefined) {
      nodes.push(<u key={key++}>{groups.underline}</u>)
    }

    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}

function renderLink(
  target: string,
  desc: string | undefined,
  options: OrgRenderOptions,
  key: number,
): ReactNode {
  const idMatch = /^id:(.+)$/.exec(target)
  if (idMatch) {
    const id = idMatch[1]
    const label = desc || options.resolveTitle(id) || id
    return (
      <button
        key={key}
        onClick={() => options.onNavigateToId(id)}
        className="text-[var(--ascipio-accent-blue)] underline decoration-dotted underline-offset-2 hover:opacity-80"
      >
        {label}
      </button>
    )
  }

  if (/^https?:\/\//.test(target)) {
    return (
      <a
        key={key}
        href={target}
        target="_blank"
        rel="noreferrer"
        className="text-[var(--ascipio-accent-blue)] underline decoration-dotted underline-offset-2 hover:opacity-80"
      >
        {desc || target}
      </a>
    )
  }

  // file:/attach: links etc. -- no resolver pipeline yet (see architecture
  // plan's pluggable link-resolver design), so just show the label as text.
  return <span key={key}>{desc || target}</span>
}
