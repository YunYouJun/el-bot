import type { GetWsParam } from 'qq-guild-bot'

/** QQ channel API context. */
export class Channels {
  /**
   * Keep the connection options for channel requests.
   * @param options - QQ client credentials and connection options.
   */
  constructor(readonly options: GetWsParam) {}
}
