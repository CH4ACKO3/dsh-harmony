import type { StudioElementRegistration, StudioVariablesRegistration } from './studio.js'

/** Host-side integration contract. Patch providers should use `dsh-harmony-react/studio` instead. */
export const STUDIO_RUNTIME_KEY = '__DSH_HARMONY_STUDIO_RUNTIME__'

/** Host-side integration contract. Patch providers should use `dsh-harmony-react/studio` instead. */
export interface StudioBrowserRuntime {
  registerElement(registration: StudioElementRegistration): () => void
  registerVariables(registration: StudioVariablesRegistration): () => void
}
