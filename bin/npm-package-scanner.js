#!/usr/bin/env node

const fs = require('fs')
const ora = require('ora')
const yargs = require('yargs')
const { Scanner, Reader } = require('../lib/index')

yargs
  .usage('$0 <pkg-name> [options]')
  .options('n', {
    alias: 'name',
    description: 'package name',
  })
  .options('v', {
    alias: 'version',
    description: 'package version',
  })
  .options('d', {
    alias: 'development',
    description: 'show development dependencies',
    default: true,
    boolean: true,
  })
  .options('o', {
    alias: 'optional',
    description: 'show optional dependencies',
    default: false,
    boolean: true,
  })
  .options('p', {
    alias: 'peer',
    description: 'show peer dependencies',
    default: false,
    boolean: true,
  })
  .options('r', {
    alias: 'registry',
    description: 'set an alternative registry url',
    default: 'https://registry.npmjs.org',
  })
  .options('f', {
    alias: 'file',
    description: 'specify output file position',
  })
  .options('depth', {
    description: 'depth',
    default: 1,
    number: true,
  })
  .options('debug', {
    description: 'enable debug logging',
    default: false,
    boolean: true,
  })
  .options('format', {
    description: 'output format, can be [default, combined, flat]',
    default: 'default',
  })
  .options('package', {
    description: 'specify input package.json position',
  })
  .options('yarn', {
    description: 'specify input yarn.lock position',
  })
  .options('lock', {
    description: 'specify input package-lock.json position',
  })

const argv = yargs.argv
const name = argv.name || argv._[0] || ''

const formatMap = {
  default: 'tree',
  combined: 'combinedTree',
  flat: 'map',
}

if (
  argv.help
  || (!name && !argv.package && !argv.yarn && !argv.lock)
) {
  yargs.showHelp()
} else {
  const scanner = new Scanner({
    development: argv.development,
    optional: argv.optional,
    peer: argv.peer,
    debug: argv.debug,
    registry: argv.registry,
    depth: argv.depth,
  })

  let spinner
  if (!argv.debug) {
    spinner = ora('Scanning')
    spinner.start()
  }

  let progress

  if (name) {
    progress = scanner.scanName(name, argv.version)
  } else {
    const file = fs.readFileSync(argv.package || argv.yarn || argv.lock, 'utf8')

    if (argv.package) {
      progress = scanner.scanPackageJson(Reader.readPackageJson(file))
    } else if (argv.yarn) {
      progress = scanner.scanLock(Reader.readYarnLock(file))
    } else if (argv.lock) {
      progress = scanner.scanLock(Reader.readPackageLock(file))
    }
  }

  progress.then((res) => {
    if (!argv.debug && spinner) spinner.succeed('Scan success')

    const format = Object.keys(formatMap).includes(argv.format) ? argv.format : 'default'
    const result = res[formatMap[format]]

    if (argv.file) {
      fs.writeFileSync(argv.file, JSON.stringify(result, null, 2))
    } else {
      console.log(JSON.stringify(result, null ,2))
    }
  }).catch((err) => {
    if (!argv.debug && spinner) spinner.fail('Scan failed')
    console.error(err)
  })
}
