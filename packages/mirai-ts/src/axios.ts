import axios from "axios";
import log from "./utils/chalk";

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

function init(baseURL: string): any {
  axios.defaults.baseURL = baseURL;
  axios.defaults.timeout = 3000;

  /**
   * 响应消息提示
   */
  axios.interceptors.response.use((res: any) => {
    if (res.status === 200 && res.data.code) {
      const message = handleStatusCode(res.data.code);
      if (message) {
        log.error(message);
      }
    }
    return res;
  }, (err) => {
    return Promise.reject(err);
  });

  return axios;
}

export default {
  init
};
