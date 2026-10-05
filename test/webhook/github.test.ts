// import { sign } from '@octokit/webhooks-methods'
// import fs from 'fs-extra'
import { describe, it } from 'vitest'

// const pushEventPayload = fs.readFileSync(
//   'test/fixtures/push-payload.json',
//   'utf-8',
// )
// let signatureSha256: string

describe('github webhook', async () => {
  // beforeAll(async () => {
  //   signatureSha256 = await sign('mySecret', pushEventPayload)
  // })

  it('local github webhook', async () => {
    // const port = 7777
    // const response = await fetch(
    //   `http://localhost:${port}/api/github/webhooks`,
    //   {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //       'X-GitHub-Delivery': '123e4567-e89b-12d3-a456-426655440000',
    //       'X-GitHub-Event': 'push',
    //       'X-Hub-Signature-256': signatureSha256,
    //     },
    //     body: pushEventPayload,
    //   },
    // )

    // expect(response.status).toEqual(200)
    // expect(await response.text()).toContain('ok')
  })
})
