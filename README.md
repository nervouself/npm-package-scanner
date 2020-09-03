# npm-package-scanner

Scan npm packages and get their package.json, get license and other information, indicate the possible impact on the project.

## Installation

```bash
npm install npm-package-scanner -g
```

## Usage

### via bash

```bash
# help
npm-package-scanner --help

# use
npm-package-scanner <package-name>

npm-package-scanner --package /path/to/package.json --file output.json
npm-package-scanner --lock /path/to/package-lock.json --file output.json
npm-package-scanner --yarn /path/to/yarn.lock --file output.json
```

### via javascript

```javascript
const { Scanner, Reader } = require('npm-package-scanner')

// default config
const scanner = new Scanner({
  logger: console,
  development: true,
  optional: false,
  peer: false,
  debug: false,
  registry: 'https://registry.npmjs.org',
  depth: 1,
})

// name
scanner.scanName(name, argv.version).then((res) => {
  console.log(res.tree)
  console.log(res.combinedTree)
  console.log(res.map)
})

// package.json
const file = fs.readFileSync('/path/to/package.json', 'utf8')
scanner.scanPackageJson(Reader.readPackageJson(file)).then((res) => {
  console.log(res.tree)
  console.log(res.combinedTree)
  console.log(res.map)
})

// package-lock.json
const file = fs.readFileSync('/path/to/package-lock.json', 'utf8')
scanner.scanLock(Reader.readPackageLock(file)).then((res) => {
  console.log(res.tree)
  console.log(res.combinedTree)
  console.log(res.map)
})

// yarn.lock
const file = fs.readFileSync('/path/to/yarn.lock', 'utf8')
scanner.scanLock(Reader.readYarnLock(file)).then((res) => {
  console.log(res.tree)
  console.log(res.combinedTree)
  console.log(res.map)
})
```

### format

```js
{
  "<dependence-name>@<version>": {
    "name": "name",
    "version": "1.0.0",
    "message": "success",
    "license": "MIT",
    "package": { /* package.json content */ },
    "dependencies": { /* if any */ },
    "devDependencies": { /* if any */ },
    "optionalDependencies": { /* if any */ },
    "peerDependencies": { /* if any */ },
  }
}
```

## License

ISC
