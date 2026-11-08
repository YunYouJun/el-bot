export const hooks = {
  beforePacking(manifest) {
    if (manifest.name !== 'el-bot')
      return manifest
    const published = { ...manifest, dependencies: { ...manifest.dependencies } }
    delete published.dependencies['@el-bot/commands']
    delete published.devDependencies
    delete published.bundledDependencies
    return published
  },
}
