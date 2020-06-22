import log from "./utils/chalk";
import { AxiosStatic, AxiosResponse } from "axios";
import { MessageType } from "..";
import Message from "./message";

/**
 * Mirai Api Http 的相关配置
 */
export interface MiraiApiHttpConfig {
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
  authKey: string,
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
 * 状态码及其对应消息
 * @param code Mirai 状态码
 * Todo: to json
 */
function handleStatusCode(code: number) {
  let msg: string = '';
  switch (code) {
    case 0:
      msg = '正常';
      break;
    case 1:
      msg = '错误的 auth key';
      break;
    case 2:
      msg = '指定的 Bot 不存在';
      break;
    case 3:
      msg = 'Session 失效或不存在';
      break;
    case 4:
      msg = 'Session 未认证(未激活)';
      break;
    case 5:
      msg = '发送消息目标不存在(指定对象不存在)';
      break;
    case 6:
      msg = '指定文件不存在，出现于发送本地图片';
      break;
    case 10:
      msg = '无操作权限，指 Bot 没有对应操作的限权';
      break;
    case 20:
      msg = 'Bot 被禁言，指 Bot 当前无法向指定群发送消息';
      break;
    case 30:
      msg = '消息过长';
      break;
    case 400:
      msg = '错误的访问，如参数错误等';
      break;
    default:
      break;
  }
  return msg;
}

export default class MiraiApiHttp {
  config: MiraiApiHttpConfig;
  axios: AxiosStatic;
  sessionKey: string;
  qq: number;
  verified: boolean;
  constructor(config: MiraiApiHttpConfig, axios: AxiosStatic) {
    this.config = config;
    this.axios = axios;
    this.sessionKey = '';
    this.qq = 0;
    this.verified = false;
  }

  /**
  * 拦截 mirai 错误信息
  */
  async handleStatusCode() {
    this.axios.interceptors.response.use(async (res: AxiosResponse) => {
      if (res.status === 200 && res.data.code) {
        const message = handleStatusCode(res.data.code);
        if (message) {
          log.error(`Code ${res.data.code}: ${message}`);

          if (res.data.code === 3) {
            log.info('正在自动尝试重新建立连接...');
            await this.auth();
            await this.verify(this.qq);
          }
        }
      }
      return res;
    }, (err) => {
      return Promise.reject(err);
    });
  }

  /**
   * 使用此方法获取插件的信息，如版本号
   * data.data: { "version": "v1.0.0" }
   */
  async about() {
    const { data } = await this.axios.get('/about');
    return data;
  }

  /**
   * 使用此方法验证你的身份，并返回一个会话
   */
  async auth(authKey = this.config.authKey) {
    const { data } = await this.axios.post('/auth', {
      authKey
    });
    if (data.code === 0) {
      this.sessionKey = data.session;
      log.success(`获取 Session: ${data.session}`);
    }
    return data;
  }

  /**
   * 使用此方法校验并激活你的Session，同时将Session与一个已登录的Bot绑定
   */
  async verify(qq: number) {
    this.qq = qq;
    const { data } = await this.axios.post('/verify', {
      sessionKey: this.sessionKey,
      qq
    });
    if (data.code === 0) {
      this.verified = true;
      log.success(`Session(${this.sessionKey}) 验证成功`);
    }
    return data;
  }


  /**
   * 使用此方式释放 session 及其相关资源（Bot不会被释放） 不使用的 Session 应当被释放，长时间（30分钟）未使用的 Session 将自动释放。
   * 否则 Session 持续保存Bot收到的消息，将会导致内存泄露(开启websocket后将不会自动释放)
   */
  async release(qq = this.qq) {
    const { data } = await this.axios.post('/release', {
      sessionKey: this.sessionKey,
      qq
    });
    if (data.code === 0) {
      this.verified = false;
      log.success(`释放 ${qq} Session: ${this.sessionKey}`);
    }
    return data;
  }

  /**
   * 获取 Bot 收到的消息和事件
   * { code: 0, data: [] }
   */
  async fetchMessage(count = 10) {
    const { data } = await this.axios.get('/fetchMessage', {
      params: {
        sessionKey: this.sessionKey,
        count
      }
    });
    return data;
  }

  /**
   * 使用此方法向指定好友发送消息
   * @param target 发送消息目标好友的 QQ 号
   * @param messageChain 消息链，是一个消息对象构成的数组
   * @param quote 引用一条消息的messageId进行回复
   * @returns { code: 0, msg: "success", messageId: 123456 } messageId 一个Int类型属性，标识本条消息，用于撤回和引用回复
   */
  async sendFriendMessage(target: number, messageChain: string | MessageType.MessageChain, quote?: number): Promise<object> {
    if (typeof messageChain === 'string') {
      messageChain = [Message.Plain(messageChain)];
    }
    const { data } = await this.axios.post('/sendFriendMessage', {
      sessionKey: this.sessionKey,
      target,
      quote,
      messageChain
    });
    return data;
  }

  /**
   * 使用此方法向指定群发送消息
   * @param target 发送消息目标群的群号
   * @param messageChain 消息链，是一个消息对象构成的数组
   * @param quote 引用一条消息的messageId进行回复
   * @return { code: 0, msg: "success", messageId: 123456 } messageId 一个Int类型属性，标识本条消息，用于撤回和引用回复
   */
  async sendGroupMessage(target: number, messageChain: string | MessageType.MessageChain, quote?: number): Promise<object> {
    if (typeof messageChain === 'string') {
      messageChain = [Message.Plain(messageChain)];
    }
    let payload = {};
    if (quote) {
      payload = {
        sessionKey: this.sessionKey,
        target,
        quote,
        messageChain
      };
    } else {
      payload = {
        sessionKey: this.sessionKey,
        target,
        messageChain
      };
    }
    const { data } = await this.axios.post('/sendGroupMessage', payload);
    return data;
  }
}
