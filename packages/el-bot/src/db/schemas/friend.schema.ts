import type { Document, Model } from 'mongoose'
import mongoose from 'mongoose'

export interface IFriend extends Document {
  /**
   * 备注姓名
   */
  name: string
  /**
   * 触发者 QQ
   */
  qq: number
  /**
   * 总计触发次数
   */
  total: number
  /**
   * 上次触发时间
   */
  lastTriggerTime: Date
  /**
   * 是否被封禁
   */
  block?: boolean
}

export const friendSchema = new mongoose.Schema({
  name: String,
  qq: { type: Number, unique: true },
  total: Number,
  lastTriggerTime: Date,
  block: Boolean,
})

export const Friend: Model<IFriend>
  = mongoose.models.Friend || mongoose.model<IFriend>('Friend', friendSchema)
