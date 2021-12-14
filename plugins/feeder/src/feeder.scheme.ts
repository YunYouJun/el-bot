import type { Document } from 'mongoose'
import mongoose from 'mongoose'

/**
 * 订阅者
 */
export interface Subscriber {
  qq: number
  groupId?: number
}

export interface IFeeder extends Document {
  /**
   * 链接
   */
  url: string
  /**
   * 刷新时间 s 默认 1000s
   */
  refresh: number
  /**
   * 目标对象
   */
  targets: Subscriber[]
}

export const feederSchema = new mongoose.Schema({
  url: { type: String, unique: true },
  refresh: Number,
  target: Array,
})

export const Feeder = mongoose.model<IFeeder>('Feeder', feederSchema)
