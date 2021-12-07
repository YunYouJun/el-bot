import mongoose, { Document } from 'mongoose'
import { check } from 'mirai-ts'

export interface ICounter extends Document {
  /**
   * 匹配规则
   */
  match: check.Match
  /**
   * 今日出现次数
   */
  today?: number
  /**
   * 至今出现次数
   */
  total: number
}

export const counterSchema = new mongoose.Schema({
  match: { type: Object, unique: true },
  today: Number,
  total: Number,
})

// auto generate createdAt & updatedAt
counterSchema.set('timestamps', true)

export const Counter = mongoose.model<ICounter>('Counter', counterSchema)
