#!/usr/bin/env node

const fs = require("node:fs")
const path = require("node:path")

function findRepositoryRoot(start) {
  let current = path.resolve(start)
  while (path.dirname(current) !== current) {
    if (fs.existsSync(path.join(current, ".git"))) return current
    current = path.dirname(current)
  }
  throw new Error("Could not find the beast-skill repository root")
}

const root = findRepositoryRoot(__dirname)
const target = path.join(root, ".agents", "skills", "beast")
const expectedRelativeTarget = path.join(".agents", "skills", "beast")

if (path.relative(root, target) !== expectedRelativeTarget) {
  throw new Error(`Refusing unexpected mirror target: ${target}`)
}

const entries = [
  ".gitignore",
  "CHANGELOG.md",
  "LICENSE",
  "README.md",
  "SKILL.md",
  "agents",
  "package.json",
  "references",
  "scripts",
  "tsconfig.json",
]

function collectFiles(base, entry, output = new Map()) {
  const absolute = path.join(base, entry)
  const stat = fs.statSync(absolute)
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(absolute).sort()) {
      collectFiles(base, path.join(entry, child), output)
    }
  } else {
    output.set(entry, fs.readFileSync(absolute))
  }
  return output
}

function snapshot(base) {
  const files = new Map()
  for (const entry of entries) {
    if (fs.existsSync(path.join(base, entry))) collectFiles(base, entry, files)
  }
  return files
}

if (process.argv.includes("--check")) {
  if (!fs.existsSync(target)) {
    console.log("No local Beast skill mirror; skipping synchronization check")
    process.exit(0)
  }

  const source = snapshot(root)
  const mirror = snapshot(target)
  const paths = [...new Set([...source.keys(), ...mirror.keys()])].sort()
  const changed = paths.filter((file) => {
    const left = source.get(file)
    const right = mirror.get(file)
    return !left || !right || !left.equals(right)
  })

  if (changed.length > 0) {
    console.error("Installed Beast skill mirror is out of sync:")
    for (const file of changed) console.error(`- ${file}`)
    console.error("Run: npm run sync:skill")
    process.exitCode = 1
  }
} else {
  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(target, { recursive: true })
  for (const entry of entries) {
    fs.cpSync(path.join(root, entry), path.join(target, entry), { recursive: true })
  }
  console.log(`Synchronized ${path.relative(root, target)}`)
}
