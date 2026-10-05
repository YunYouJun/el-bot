import { spawn } from 'node:child_process'
import process from 'node:process'
import { createInterface } from 'node:readline'

const send = data => process.stdout.write(`${JSON.stringify(data)}\n`)
let terminal
let unrelated
createInterface({ input: process.stdin }).on('line', async (line) => {
  const request = JSON.parse(line)
  if (request.method === 'initialized')
    return
  if (request.method === 'turn/start') {
    terminal = spawn(process.execPath, ['--input-type=module', '-e', 'import {writeFileSync} from "node:fs"; setTimeout(() => writeFileSync(process.argv[1], "late side effect"), 900)', process.argv[2]], { stdio: 'ignore' })
    unrelated = spawn(process.execPath, ['--input-type=module', '-e', 'import {writeFileSync} from "node:fs"; setTimeout(() => writeFileSync(process.argv[1], "unrelated work"), 900)', `${process.argv[2]}.unrelated`], { stdio: 'ignore' })
    send({ id: request.id, result: { turn: { id: 'turn' } } })
    return
  }
  if (request.method === 'turn/interrupt') {
    send({ method: 'turn/completed', params: { threadId: 'thread', turn: { id: 'turn', status: 'interrupted' } } })
  }
  if (request.method === 'thread/backgroundTerminals/list') {
    const data = []
    if (terminal && terminal.exitCode === null && terminal.signalCode === null)
      data.push({ itemId: 'command-item', processId: 'terminal' })
    if (unrelated && unrelated.exitCode === null && unrelated.signalCode === null)
      data.push({ itemId: 'other-turn-item', processId: 'unrelated' })
    send({ id: request.id, result: { data } })
    return
  }
  if (request.method === 'thread/backgroundTerminals/terminate') {
    const target = request.params.processId === 'terminal' ? terminal : unrelated
    target.kill('SIGTERM')
    await new Promise(resolve => target.once('exit', resolve))
  }
  send({ id: request.id, result: {} })
})
