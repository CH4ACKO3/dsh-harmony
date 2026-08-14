export { answer } from './helper.js'

export async function lazyAnswer() {
  return (await import('./lazy.js')).answer()
}
