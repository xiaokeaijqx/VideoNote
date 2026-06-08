import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/utils/timeAnchors.ts', import.meta.url), 'utf8')
const { outputText: code } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
})

const moduleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`
const { findClosestTimeAnchor, formatTimestamp, formatSrtTimestamp, serializeSegmentsAsSrt } =
  await import(moduleUrl)

assert.equal(
  findClosestTimeAnchor(
    [
      { seconds: 12, element: 'a' },
      { seconds: 42, element: 'b' },
      { seconds: 81, element: 'c' },
    ],
    44
  )?.element,
  'b'
)

assert.equal(
  findClosestTimeAnchor(
    [
      { seconds: 12, element: 'a' },
      { seconds: 42, element: 'b' },
      { seconds: 81, element: 'c' },
    ],
    75
  )?.element,
  'c'
)

assert.equal(formatTimestamp(125), '2:05')
assert.equal(formatSrtTimestamp(3723.45), '01:02:03,450')

assert.equal(
  serializeSegmentsAsSrt([
    { start: 0, end: 1.5, text: '第一句' },
    { start: 1.5, end: 4, text: '第二句' },
  ]),
  '1\n00:00:00,000 --> 00:00:01,500\n第一句\n\n2\n00:00:01,500 --> 00:00:04,000\n第二句\n'
)

console.log('timeAnchors checks passed')
