import { execFileSync } from 'node:child_process'

const releaseType = process.argv[2]
if (releaseType !== 'routine' && releaseType !== 'major') {
  throw new Error('Choose a routine or major release.')
}

const releaseTag = /^v(\d{4})\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const previousTag = git('tag', '--list', '--sort=-version:refname')
  .split('\n')
  .find((tag) => releaseTag.test(tag))

const year = new Date().getUTCFullYear()
let major = 0
let batch = 1

if (previousTag) {
  const [previousYear, previousMajor, previousBatch] = previousTag.slice(1).split('.').map(Number)
  if (previousYear > year) throw new Error(`Release ${previousTag} is dated after ${year}.`)
  if (git('rev-parse', `${previousTag}^{commit}`) === git('rev-parse', 'HEAD')) {
    throw new Error(`${previousTag} already releases this commit.`)
  }
  git('merge-base', '--is-ancestor', previousTag, 'HEAD')

  if (previousYear === year) {
    major = previousMajor
    batch = previousBatch + 1
  }
}

if (releaseType === 'major') {
  major += 1
  batch = 0
}

console.log(`version=${year}.${major}.${batch}`)
console.log(`previous_tag=${previousTag ?? ''}`)
