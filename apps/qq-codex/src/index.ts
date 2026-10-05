#!/usr/bin/env node
import process from 'node:process'
import consola from 'consola'
import { runCli } from './cli'

runCli().catch((error: unknown) => {
  consola.error(error instanceof Error ? error.message : 'QQ Codex 启动失败')
  process.exitCode = 1
})
