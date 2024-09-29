/**
 * @see https://github.com/Rishikant181/Rettiwt-API
 */

import process from 'node:process'
import { consola } from 'el-bot'
import { Rettiwt } from 'rettiwt-api'

if (!process.env.RETTIWT_API_KEY) {
  consola.error('Please set RETTIWT_API_KEY in .env')
  process.exit(1)
}

const rettiwt = new Rettiwt({
  apiKey: process.env.RETTIWT_API_KEY,
})

// const username = 'YunYouJun'
const username = 'yyjmoe'
rettiwt.user.details(username)
  .then((details) => {
    consola.info(details)
  })

rettiwt.tweet.search({
  fromUsers: [username],
})
  .then((tweets) => {
    consola.info(tweets)
  })
  .catch((err) => {
    consola.error(err)
  })
