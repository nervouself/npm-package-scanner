const semver = require('semver')
const got = require('got')
const npa = require('npm-package-arg')

const getBlankObj = () => Object.create(null)

const getRequest = url => got.get(url, { responseType: 'json' }).then((res) => {
  if (res.statusCode < 200 || res.statusCode >= 400) {
    return new Error('could not load ' + npaResult.raw + ': ' + res.statusMessage)
  }
  return res.body
}).catch(e => e)

const getMark = (name, version) => `${name}@${version}`

const defaultConfig = require('./config')

class Scanner {
  constructor(config) {
    this.config = Object.assign({}, defaultConfig, config)

    this.tree = getBlankObj()
    this.combinedTree = getBlankObj()
    this.map = getBlankObj()
    this.queue = []
    this.depth = 0
  }

  _log(msg) {
    this.config.debug && this.config.logger.log(msg)
  }

  async _loadPackageJson(name, version) {
    const mark = getMark(name, version)

    this._log(`load ${mark}`)

    if (this.config.cache && typeof this.config.cache.get === 'function') {
      let cache
      try {
        cache = JSON.parse(await this.config.cache.get(mark))
      } catch (e) {
        this._log(`"${mark}" hit from cache but JSON.parse error: ${e.message}`)
      }
      if (cache) {
        this._log(`hit from cache: ${mark}`)
        return cache
      }
    }

    const npaResult = npa(mark)
    let result
    if (version.startsWith('git') && npaResult.hosted && npaResult.hosted.type === 'github') {
      result = await this._loadFromGithub(npaResult)
    } else {
      result = await this._loadFromNpm(npaResult)
    }

    if (
      result
      && !(result instanceof Error)
      && this.config.cache
      && typeof this.config.cache.set === 'function'
    ) {
      this.config.cache.set(mark, JSON.stringify(result))
    }

    return result
  }

  async _loadFromNpm(npaResult) {
    const url = `${this.config.registry.replace(/\/$/, '')}/${npaResult.escapedName}`
    this._log(`_loadFromNpm: ${url}`)
    const packageJson = await getRequest(url)
    const version = this._guessVersion(npaResult.fetchSpec || 'latest', packageJson)
    if (version instanceof Error) return version
    return packageJson.versions[version]
  }

  _loadFromGithub(npaResult) {
    const h = npaResult.hosted
    const url = `https://raw.githubusercontent.com/${h.user}/${h.project}/${h.committish || 'master'}/package.json`
    this._log(`_loadFromGithub: ${url}`)
    return getRequest(url)
  }

  _getLicense(packageJson) {
    const license = packageJson.license || packageJson.licenses;
    if (!license) {
      if (packageJson.private) {
        return 'private';
      }
      return null;
    }
    if (typeof license === 'string') return license;
    if (Array.isArray(license)) {
      const types = license.map(x => x.type).filter(x => !!x);
      return types.length === 1 ? types[0] : types.join(' OR ');
    }
    return license.type || null;
  }

  _pushQueue(name, version, target, root, combinedRoot) {
    const mark = getMark(name, version)
    root[target][mark] = getBlankObj()
    if (!combinedRoot.dependencies[mark]) {
      combinedRoot.dependencies[mark] = getBlankObj()
    }
    this.queue.push({
      parent: combinedRoot,
      name,
      version,
      root: root[target][mark],
      combinedRoot: combinedRoot.dependencies[mark],
    })
  }

  _setBlank(packageJson, target, root, combinedRoot) {
    if (packageJson[target]) {
      root[target] = getBlankObj()
      if (!combinedRoot.dependencies) {
        combinedRoot.dependencies = getBlankObj()
      }
      Object.entries(packageJson[target]).forEach(([name, version]) => {
        this._pushQueue(name, version, target, root, combinedRoot)
      })
    }
  }

  _walkDependencies(packageJson, root, combinedRoot) {
    root.name = combinedRoot.name = packageJson.name
    root.version = combinedRoot.version = packageJson.version
    root.message = combinedRoot.message = 'success'
    root.license = combinedRoot.license = this._getLicense(packageJson)
    root.package = combinedRoot.package = packageJson

    const mark = getMark(root.name, root.version)
    if (!this.map[mark] && this.depth > 0) {
      this.map[mark] = Object.assign({}, root)
    }

    if (this.config.depth && this.depth >= this.config.depth) {
      return
    }

    const { development, optional, peer } = this.config
    this._setBlank(packageJson, 'dependencies', root, combinedRoot)
    if (development) {
      this._setBlank(packageJson, 'devDependencies', root, combinedRoot)
    }
    if (optional) {
      this._setBlank(packageJson, 'optionalDependencies', root, combinedRoot)
    }
    if (peer) {
      this._setBlank(packageJson, 'peerDependencies', root, combinedRoot)
    }
  }

  _guessVersion(versionString, packageJson) {
    if (packageJson instanceof Error) return packageJson

    if (versionString === 'latest') versionString = '*'

    var availableVersions = Object.keys(packageJson.versions)
    var version = semver.maxSatisfying(availableVersions, versionString, true)

    if (!version && versionString === '*' && availableVersions.every(function (av) {
      return new semver.SemVer(av, true).prerelease.length
    })) {
      version = packageJson['dist-tags'] && packageJson['dist-tags'].latest
    }

    if (!version && /^\w$/.test(versionString) && availableVersions.includes(
      packageJson['dist-tags'] && packageJson['dist-tags'][versionString]
    )) {
      version = packageJson['dist-tags'] && packageJson['dist-tags'][versionString]
    }

    if (!version) {
      return new Error('could not find a satisfactory version for string ' + versionString)
    }
    return version
  }

  async _flushQueue() {
    ++this.depth

    this._log('\n_flushQueue')
    this._log(`depth: ${this.depth}`)
    this._log(`queue length: ${this.queue.length}`)

    if (this.queue.length) {
      await Promise.all(this.queue.splice(0, this.queue.length).map((task) => {
        if (!task.name || !task.version) {
          return
        }
        const mark = getMark(task.name, task.version)
        let cur = task.parent && task.parent.parent
        // avoid loop
        while (cur) {
          if (Object.keys(cur.dependencies).includes(mark)) {
            return false
          }
          cur = cur.parent
        }
        return this._loadPackageJson(task.name, task.version).then((packageJson) => {
          if (packageJson instanceof Error) {
            task.root.name = task.combinedRoot.name = task.name
            task.root.version = task.combinedRoot.version = task.version
            task.root.message = task.combinedRoot.message = packageJson.message
            return
          }
          this._walkDependencies(packageJson, task.root, task.combinedRoot)

          this._log(`walk end ${task.name}@${task.version}`)
        })
      }))

      this._log(`depth end: ${this.depth}`)
      this._log(`queue length: ${this.queue.length}`)
      
      return this._flushQueue()
    } else {
      this._done()
    }
  }

  _done() {
    this._resolve && this._resolve({
      tree: this.tree,
      combinedTree: this.combinedTree,
      map: this.map
    })
  }

  scanName(name, version) {
    if (!version) {
      const npaResult = npa(name)
      name = npaResult.escapedName
      version = npaResult.fetchSpec
    }

    this.queue.push({
      parent: null,
      name,
      version,
      root: this.tree,
      combinedRoot: this.combinedTree,
    })

    return new Promise((resolve, reject) => {
      this._resolve = resolve
      this._flushQueue().catch((e) => reject(e))
    })
  }

  scanLock(array) {
    this.tree.dependencies = getBlankObj()
    this.combinedTree.dependencies = getBlankObj()

    array.forEach(({ name, version }) => {
      if (name && version) {
        this._pushQueue(name, version, 'dependencies', this.tree, this.combinedTree)
      }
    })

    return new Promise((resolve, reject) => {
      this._resolve = resolve
      this._flushQueue().catch((e) => reject(e))
    })
  }

  scanPackageJson(packageJson) {
    this._walkDependencies(packageJson, this.tree, this.combinedTree)

    return new Promise((resolve, reject) => {
      this._resolve = resolve
      this._flushQueue().catch((e) => reject(e))
    })
  }
}

module.exports = Scanner
