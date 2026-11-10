import { feature as auto } from './auto/index.js'
import { feature as catalog } from './catalog-host.js'
import { feature as diagnostics } from './diagnostics-host.js'
import { feature as usage } from './usage/index.js'
import { feature as studio } from './studio/index.js'
import { feature as liked } from './liked/index.js'

/** @type {{ id: string, register(ctx: unknown): void }[]} */
export const features = [auto, catalog, diagnostics, usage, studio, liked]
