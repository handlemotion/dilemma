import { DOCUMENT_VERSION, type DilemmaDocument } from './document.ts'

/**
 * One migration per version. `migrations[n]` upgrades a version-n document to
 * version n + 1. Add an entry here every time DOCUMENT_VERSION goes up, and a
 * test that loads a stored document of the old version.
 */
const migrations: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {}

export class DocumentVersionError extends Error {}

export function migrate(raw: unknown): DilemmaDocument {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new DocumentVersionError('A Dilemma document must be an object.')
  }
  let doc = raw as Record<string, unknown>
  let version = doc['version']
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new DocumentVersionError(`Unknown document version: ${String(version)}`)
  }
  if (version > DOCUMENT_VERSION) {
    throw new DocumentVersionError(
      `This document is version ${version}; this build reads up to ${DOCUMENT_VERSION}.`,
    )
  }
  while (version < DOCUMENT_VERSION) {
    const step = migrations[version]
    if (!step) throw new DocumentVersionError(`No migration from version ${version}.`)
    doc = step(doc)
    version += 1
    doc['version'] = version
  }
  return doc as unknown as DilemmaDocument
}
