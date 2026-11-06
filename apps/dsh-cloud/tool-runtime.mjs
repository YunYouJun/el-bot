import { readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'

// rc.5 uses a module-local scheduler Symbol. npm's peer trees can install
// several identical copies, so AgentLoop and ToolRuntime must share one module.
// Resolve imports without rewriting vendor files or weakening execution guards.
const require = createRequire('/opt/dsh-runtime/node_modules/@deepseek-ai/dsh/package.json')
const manifest = JSON.parse(readFileSync(require.resolve('@deepseek-ai/dsh-tools/package.json'), 'utf8'))
if (manifest.version !== '0.2.1-rc.5')
  throw new Error('Review the DSH tool runtime identity adapter before upgrading')
const canonical = pathToFileURL(require.resolve('@deepseek-ai/dsh-tools')).href
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/dsh-tools')
      return { url: canonical, shortCircuit: true }
    return nextResolve(specifier, context)
  },
})
