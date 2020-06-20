import axios from "./axios";

interface MiraiApiHttpConfig {
  /**
   * 可选，默认值为0.0.0.0
   */
  host: string,
  /**
   * 可选，默认值为8080
   */
  port: number,
  /**
   * 可选，默认由 mirai-api-http 随机生成，建议手动指定。未传入该值时，默认未 'el-bot-js'
   */
  authKey?: string,
  /**
   * 可选，缓存大小，默认4096.缓存过小会导致引用回复与撤回消息失败
   */
  cacheSize?: number,
  /**
   * 可选，是否开启websocket，默认关闭，建议通过Session范围的配置设置
   */
  enableWebsocket?: boolean,
  /**
   * 可选，配置CORS跨域，默认为*，即允许所有域名
   */
  cors?: string[];
}

/**
 * Mirai SDK 初始化类
 */
export default class Mirai {
  mahConfig: MiraiApiHttpConfig;
  axios: any;
  constructor(mahConfig: MiraiApiHttpConfig = {
    host: '0.0.0.0',
    port: 8080,
    authKey: 'el-bot-js',
    cacheSize: 4096,
    enableWebsocket: false,
    cors: ['*']
  }) {
    this.mahConfig = mahConfig;
    this.axios = axios.init(mahConfig.host + mahConfig.port);
  }

  async auth() {
    const { data } = await this.axios.post('/auth', {
      authKey: this.mahConfig.authKey
    });
    data;
  }
}
