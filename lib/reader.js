const readPackageJson = (file) => {
  if (!file || typeof file !== 'string') {
    throw new Error('package.json mast be utf-8 string')
  }

  return JSON.parse(file)
}

const readPackageLock = (file) => {
  if (!file || typeof file !== 'string') {
    throw new Error('package-lock.json mast be utf-8 string')
  }

  const output = []

  const packageLock = JSON.parse(file)
  if (packageLock.dependencies && typeof packageLock.dependencies === 'object') {
    Object.entries(packageLock.dependencies).map(([name, info]) => {
      if (name && info && info.version) {
        output.push({ name: name, version: info.version })
      }
    })
  }

  return output
}

const readYarnLock = (file) => {
  if (!file || typeof file !== 'string') {
    throw new Error('yarn.lock mast be utf-8 string')
  }

  const arr = file.split('\n\n').filter((str) => !str.startsWith('#'))

  const output = []

  arr.forEach((str) => {
    let match
    if (str.startsWith('"')) {
      match = str.match(/^"(@[^@]+)@[^:]+":\s+version "([^"]+)"/)
        || str.match(/^"([^@]+)@[^:]+"?:\s+version "([^"]+)"/)
        || str.match(/^"(@?[^@]+)@(git[^"]+)"/)
    } else {
      match = str.match(/^([^@]+)@[^:]+:\s+version "([^"]+)"/)
    }
    if (match) {
      output.push({ name: match[1], version: match[2] })
    }
  })

  return output
}

module.exports = {
  readPackageJson,
  readPackageLock,
  readYarnLock,
}