// Shared provenance frontmatter types, parser, and builder.
// Used by: knowledge-writer, knowledge-extractor, cook-lesson-extractor, vault-context-loader.

/** Standardized provenance fields for all local knowledge artifacts. */
export interface ProvenanceFrontmatter {
  date: string; // required: YYYY-MM-DD
  category?: string; // "lesson" | "pattern" | "decision"
  'source-phase'?: string; // "journal" | "run-record" | "cook" | "plan"
  'source-project'?: string; // project name for sync compat (e.g. "medusa")
  project?: string; // legacy alias — kept for backward compat
  issue?: number; // GitHub issue number
  'task-id'?: string; // task identifier (e.g. "1.2")
  'synced-at'?: string; // ISO timestamp when written/classified
  tags?: string[]; // searchable tags
  'classified-by'?: string; // model used (e.g. "haiku")
  'classification-reason'?: string;
  'injected-from'?: string; // skip marker: "second-brain" if injected from vault
}

/** True if content starts with a YAML frontmatter block. */
export function hasFrontmatter(content: string): boolean {
  return content.startsWith('---\n');
}

/**
 * Parse YAML frontmatter from note content.
 * Never throws — returns { date: '' } on parse failure.
 */
export function parseFrontmatter(content: string): ProvenanceFrontmatter {
  const result: ProvenanceFrontmatter = { date: '' };
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return result;

  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();

    switch (key) {
      case 'date':                    result.date = val; break;
      case 'category':                result.category = val; break;
      case 'source-phase':            result['source-phase'] = val; break;
      case 'source-project':          result['source-project'] = val; break;
      case 'project':                 result.project = val; break;
      case 'issue':                   { const n = Number(val); if (n) result.issue = n; break; }
      case 'task-id':                 result['task-id'] = val; break;
      case 'synced-at':               result['synced-at'] = val; break;
      case 'classified-by':           result['classified-by'] = val; break;
      case 'classification-reason':   result['classification-reason'] = val.replace(/^"|"$/g, ''); break;
      case 'injected-from':           result['injected-from'] = val; break;
      case 'tags': {
        const raw = val.replace(/^\[|\]$/g, '');
        result.tags = raw.split(',').map(t => t.trim()).filter(Boolean);
        break;
      }
    }
  }
  return result;
}

/** True if note has `injected-from` marker — must never be re-promoted. */
export function isInjectedNote(content: string): boolean {
  return !!parseFrontmatter(content)['injected-from'];
}

/** True if note was already classified/written (has `synced-at`). */
export function isSyncedNote(content: string): boolean {
  return !!parseFrontmatter(content)['synced-at'];
}

/** Build a YAML frontmatter block string from provenance metadata. */
export function buildFrontmatter(meta: ProvenanceFrontmatter): string {
  const lines: string[] = ['---'];
  lines.push(`date: ${meta.date}`);
  if (meta.category)                lines.push(`category: ${meta.category}`);
  if (meta['source-phase'])         lines.push(`source-phase: ${meta['source-phase']}`);
  if (meta['source-project'])       lines.push(`source-project: ${meta['source-project']}`);
  if (meta.project)                 lines.push(`project: ${meta.project}`);
  if (meta.issue != null)           lines.push(`issue: ${meta.issue}`);
  if (meta['task-id'])              lines.push(`task-id: ${meta['task-id']}`);
  if (meta['synced-at'])            lines.push(`synced-at: ${meta['synced-at']}`);
  if (meta.tags?.length)            lines.push(`tags: [${meta.tags.join(', ')}]`);
  if (meta['classified-by'])        lines.push(`classified-by: ${meta['classified-by']}`);
  if (meta['classification-reason']) {
    lines.push(`classification-reason: "${meta['classification-reason'].replace(/"/g, "'")}"`);
  }
  if (meta['injected-from'])        lines.push(`injected-from: ${meta['injected-from']}`);
  lines.push('---', '');
  return lines.join('\n');
}
