import { Buffer } from 'node:buffer'
import nacl from 'tweetnacl'

import { ValidationPayload, ValidationResponse } from './types'

export function generateSeed(botSecret: string): Uint8Array {
  if (!botSecret)
    throw new Error('QQ bot secret is required')
  let seedStr = botSecret
  let seedBuffer = Buffer.from(seedStr, 'utf8')

  // 重复字符串直到达到或超过 32 字节
  while (seedBuffer.length < 32) {
    seedStr += seedStr
    seedBuffer = Buffer.from(seedStr, 'utf8')
  }

  // 截取前 32 字节
  return new Uint8Array(seedBuffer.slice(0, 32))
}

export async function handleValidation(request: Request, botSecret: string) {
  // 读取并解析请求体
  const validationPayload = (await request.json()) as ValidationPayload

  // 生成确定性 ED25519 种子
  const seed = generateSeed(botSecret)

  // 从种子生成密钥对
  const keyPair = nacl.sign.keyPair.fromSeed(seed)

  // 构造签名消息
  const msg = Buffer.concat([
    Buffer.from(validationPayload.d.event_ts, 'utf8'),
    Buffer.from(validationPayload.d.plain_token, 'utf8'),
  ])

  // 生成签名并转为十六进制
  const signature = nacl.sign.detached(msg, keyPair.secretKey)
  const signatureHex = Buffer.from(signature).toString('hex')

  // 构造响应
  const response: ValidationResponse = {
    plain_token: validationPayload.d.plain_token,
    signature: signatureHex,
  }

  return response
}

// // 使用示例
// const botSecret = 'your-bot-secret' // 从环境变量或配置获取
// app.post('/validate', handleValidation(botSecret))

// app.listen(3000, () => {
//   console.log('Server running on port 3000')
// })
