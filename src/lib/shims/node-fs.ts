/**
 * Browser stand-in for `node:fs` and `node:fs/promises`. Only `beast-tsrx`'s
 * project builder imports them, and the playground never calls it, so every
 * export fails loudly rather than pretending to work.
 */
const unavailable = (name: string) => (): never => {
  throw new Error(`${name} is not available in the browser`)
}

export const watch = unavailable('fs.watch')
export const lstat = unavailable('fs.lstat')
export const mkdir = unavailable('fs.mkdir')
export const readdir = unavailable('fs.readdir')
export const readFile = unavailable('fs.readFile')
export const rmdir = unavailable('fs.rmdir')
export const unlink = unavailable('fs.unlink')
export const writeFile = unavailable('fs.writeFile')
