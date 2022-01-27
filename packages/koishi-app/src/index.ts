import { App } from 'koishi'
import { setup } from './bot'

// 创建一个 Koishi 应用
const app = new App()

setup(app)

// 启动应用
app.start()
