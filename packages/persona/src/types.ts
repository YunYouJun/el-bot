export interface PersonaMetadata {
  id: string
  name: string
  description?: string
  author?: string
  version?: string
  license?: string
  homepage?: string
}

export type PersonaSource
  = { kind: 'file', path: string }
    | { kind: 'url', url: string }
    | { kind: 'git', repository: string, path: string, ref: string, commit: string }
    | { kind: 'text', name: string }

export type PersonaImport
  = { kind: 'file', path: string }
    | { kind: 'url', url: string }
    | { kind: 'git', repository: string, path: string, ref?: string }
    | { kind: 'text', name: string, text: string }

export interface PersonaRevision {
  hash: string
  metadata: PersonaMetadata
  source: PersonaSource
  importedAt: string
}

export interface PersonaCard extends PersonaRevision {
  revisions: PersonaRevision[]
}

export interface PersonaSelection { id: string, hash: string }
export interface PersonaLibraryState {
  version: 1
  cards: PersonaCard[]
  active?: PersonaSelection
}

export interface PersonaPreview extends PersonaRevision {
  markdown: string
  body: string
}

export interface PersonaResult {
  library: PersonaLibraryState
  preview?: PersonaPreview
}
