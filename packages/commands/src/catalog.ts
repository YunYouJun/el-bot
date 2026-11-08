export interface CommandMetadata {
  readonly description: string
  readonly usage?: string
  readonly examples: readonly string[]
  readonly hidden: boolean
}

export interface CommandCatalogOptions<T> {
  /** Normalize a name consistently during registration and lookup. */
  readonly normalize?: (name: string) => string
  /** Reject a normalized name. Throw to abort the registration. */
  readonly validate?: (name: string) => void
  /** Names and aliases owned outside this catalog. */
  readonly reserved?: Iterable<string>
  /** Project a runtime payload to the shared directory metadata. */
  readonly describe?: (payload: T) => CommandMetadata
}

export interface CommandRegistration<T> {
  readonly name: string
  readonly aliases?: readonly string[]
  readonly payload: T
}

export interface CommandEntry<T> {
  readonly name: string
  readonly aliases: readonly string[]
  readonly payload: T
  readonly metadata: CommandMetadata
}

interface Registration<T> {
  readonly name: string
  readonly aliases: readonly string[]
  readonly payload: T
  readonly dispose: () => void
}

const EMPTY_METADATA: CommandMetadata = {
  description: '',
  examples: [],
  hidden: false,
}

/**
 * One ordered command index with atomic registration and identity-aware removal.
 * Runtimes keep their own instance and payload type; this class never executes a handler.
 */
export class CommandCatalog<T> {
  private readonly index = new Map<string, Registration<T>>()
  private readonly ordered: Registration<T>[] = []
  private readonly normalizeName: (name: string) => string
  private readonly validateName?: (name: string) => void
  private readonly reserved: Set<string>
  private readonly describe?: (payload: T) => CommandMetadata
  private mapView?: Map<string, T>

  constructor(options: CommandCatalogOptions<T> = {}) {
    this.normalizeName = options.normalize ?? (name => name.trim())
    this.validateName = options.validate
    this.describe = options.describe
    this.reserved = new Set()
    for (const name of options.reserved ?? []) {
      const normalized = this.normalizeName(name)
      if (normalized)
        this.reserved.add(normalized)
    }
  }

  /** Register one payload and return an idempotent disposer for that registration. */
  register(entry: CommandRegistration<T>): () => void {
    const name = this.normalizeName(entry.name)
    const aliases = (entry.aliases ?? []).map(alias => this.normalizeName(alias))
    const names = [name, ...aliases]
    for (const value of names) {
      if (!value)
        throw new Error('A command name must not be empty')
      this.validateName?.(value)
    }
    if (new Set(names).size !== names.length)
      throw new Error(`Command "${name}" repeats one of its own names or aliases`)
    if (this.mapView && aliases.length)
      throw new Error('A command Map view requires registrations without aliases')
    for (const value of names) {
      if (this.reserved.has(value))
        throw new Error(`Command "${value}" is reserved`)
      if (this.index.has(value))
        throw new Error(`Command "${value}" already exists`)
    }

    const registration: Registration<T> = {
      name,
      aliases: [...aliases],
      payload: entry.payload,
      dispose: () => this.remove(registration),
    }
    for (const value of names)
      this.index.set(value, registration)
    this.ordered.push(registration)

    return registration.dispose
  }

  private remove(registration: Registration<T>) {
    for (const name of [registration.name, ...registration.aliases]) {
      if (this.index.get(name) === registration)
        this.index.delete(name)
    }
    const position = this.ordered.indexOf(registration)
    if (position >= 0)
      this.ordered.splice(position, 1)
  }

  asMap(): Map<string, T> {
    if (this.mapView)
      return this.mapView
    if (this.ordered.some(registration => registration.aliases.length))
      throw new Error('A command Map view requires registrations without aliases')
    const index = this.index
    const ordered = this.ordered
    const remove = (registration: Registration<T>) => this.remove(registration)
    this.mapView = new class extends Map<string, T> {
      override get size() {
        return index.size
      }

      override get(name: string) {
        return index.get(name)?.payload
      }

      override has(name: string) {
        return index.has(name)
      }

      override set(name: string, payload: T) {
        const previous = index.get(name)
        const registration: Registration<T> = {
          name,
          aliases: [],
          payload,
          dispose: () => remove(registration),
        }
        if (previous) {
          const position = ordered.indexOf(previous)
          for (const key of [previous.name, ...previous.aliases]) {
            if (index.get(key) === previous)
              index.set(key, registration)
          }
          ordered[position] = registration
        }
        else {
          index.set(name, registration)
          ordered.push(registration)
        }
        return this
      }

      override delete(name: string) {
        const registration = index.get(name)
        if (!registration)
          return false
        remove(registration)
        return true
      }

      override clear() {
        index.clear()
        ordered.splice(0)
      }

      override* entries(): MapIterator<[string, T]> {
        for (const [name, registration] of index)
          yield [name, registration.payload]
      }

      override* keys(): MapIterator<string> {
        yield* index.keys()
      }

      override* values(): MapIterator<T> {
        for (const registration of index.values())
          yield registration.payload
      }

      override [Symbol.iterator]() {
        return this.entries()
      }

      override forEach(callback: (value: T, key: string, map: Map<string, T>) => void, thisArg?: unknown) {
        for (const [name, value] of this)
          callback.call(thisArg, value, name, this)
      }
    }()
    return this.mapView
  }

  getDisposer(name: string): (() => void) | undefined {
    return this.index.get(this.normalizeName(name))?.dispose
  }

  /** Resolve a canonical name or alias to the original runtime payload. */
  resolve(name: string): T | undefined {
    return this.index.get(this.normalizeName(name))?.payload
  }

  has(name: string): boolean {
    return this.index.has(this.normalizeName(name))
  }

  isReserved(name: string): boolean {
    return this.reserved.has(this.normalizeName(name))
  }

  /** Return one entry per registration, in registration order, as an isolated snapshot. */
  list(): readonly CommandEntry<T>[] {
    return this.ordered.map((registration) => {
      const metadata = this.describe?.(registration.payload) ?? EMPTY_METADATA
      return {
        name: registration.name,
        aliases: [...registration.aliases],
        payload: registration.payload,
        metadata: {
          description: metadata.description,
          ...(metadata.usage ? { usage: metadata.usage } : {}),
          examples: [...metadata.examples],
          hidden: metadata.hidden,
        },
      }
    })
  }
}
