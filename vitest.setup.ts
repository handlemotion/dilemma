// three's FileLoader reports progress with ProgressEvent, which Node lacks.
if (typeof globalThis.ProgressEvent === 'undefined') {
  class ProgressEvent extends Event {
    readonly lengthComputable: boolean
    readonly loaded: number
    readonly total: number
    constructor(
      type: string,
      init: { lengthComputable?: boolean; loaded?: number; total?: number } = {},
    ) {
      super(type)
      this.lengthComputable = init.lengthComputable ?? false
      this.loaded = init.loaded ?? 0
      this.total = init.total ?? 0
    }
  }
  Object.assign(globalThis, { ProgressEvent })
}
