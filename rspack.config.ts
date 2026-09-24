import { HtmlRspackPlugin, NormalModuleReplacementPlugin, type Configuration } from '@rspack/core'
import { beastOctane } from 'beast-tsrx/rspack'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const srcDir = fileURLToPath(new URL('./src', import.meta.url))
const root = path.dirname(fileURLToPath(import.meta.url))

const config: Configuration = {
  context: root,
  entry: './src/main.ts',
  output: {
    publicPath: '/'
  },
  experiments: { css: true },
  module: { rules: [{ test: /\.css$/u, type: 'css', use: ['postcss-loader'] }] },
  plugins: [
    new HtmlRspackPlugin({ template: './index.html' }),
    // The TSRX panel runs `beast-tsrx`'s compiler in the browser. Its package
    // entry also re-exports a file-system project builder, whose `node:`
    // imports have no browser build; these shims stand in for them.
    new NormalModuleReplacementPlugin(/^node:path$/u, path.resolve(root, 'src/lib/shims/node-path.ts')),
    new NormalModuleReplacementPlugin(/^node:fs(\/promises)?$/u, path.resolve(root, 'src/lib/shims/node-fs.ts')),
    // `.btsx` files take their root component name from the filename, so
    // `avatar.btsx` would emit `export default function Avatar` and collide
    // with the `Avatar` parts object the file exports. Name the root
    // explicitly instead.
    beastOctane({
      components: {
        'src/components/ui/avatar.btsx': { componentName: 'AvatarRoot' },
        // The file's own component here is the Group — the `props` block at
        // column zero. Naming it explicitly keeps it out of the way of the
        // `FluidTooltip` parts object the same file exports.
        'src/components/ui/fluid-tooltip.btsx': { componentName: 'FluidTooltipGroup' },
        // The root here is the separator; named after the file it would
        // replace the `ButtonGroup` component the file exports.
        'src/components/ui/button-group.btsx': { componentName: 'ButtonGroupSeparator' }
      }
    })
  ],
  // The converter runs the TypeScript compiler in the browser. `typescript.js`
  // reads `__filename`/`__dirname` and loads plugins with a computed `require`,
  // but only on its Node code paths, which never run here. Mocking the globals
  // is what rspack already did by default; this just says so without the
  // warning. The computed `require` can't be resolved and doesn't need to be.
  node: { __filename: 'mock', __dirname: 'mock' },
  ignoreWarnings: [
    { module: /node_modules[\\/]typescript[\\/]lib[\\/]typescript\.js$/u, message: /Critical dependency/u }
  ],
  // The TypeScript compiler alone is several MiB and has to load up front, so
  // the default 300/500 KiB budgets would always warn. These sit just above
  // the current bundle, so real growth still gets flagged.
  performance: {
    maxAssetSize: 6 * 1024 * 1024,
    maxEntrypointSize: 6 * 1024 * 1024
  },
  devServer: { historyApiFallback: true },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.btsx', '.mdx'],
    // `@octanejs/day-picker` ships TypeScript sources that import with explicit
    // `.js` extensions (NodeNext style). Without this mapping those specifiers
    // resolve against the non-existent emitted files and the package fails.
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js']
    },
    // Mirror the `paths` mapping from tsconfig.json so `@/...` specifiers
    // resolve identically in the bundler and the type checker.
    tsConfig: {
      configFile: path.resolve(root, 'tsconfig.json'),
      references: 'auto'
    },
    alias: {
      '@': srcDir
    }
  }
}

export default config
