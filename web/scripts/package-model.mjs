import { modelManifest, packageModel } from './model-resources.mjs'

await packageModel(new URL(`../../docs/models/${modelManifest.directory}/`, import.meta.url))
console.log('Complete model packaged for the committed docs/ website.')
