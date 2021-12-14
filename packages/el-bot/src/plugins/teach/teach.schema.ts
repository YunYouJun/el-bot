import type { Document } from 'mongoose'
import mongoose from 'mongoose'

export interface ITeach extends Document {
  /**
   * 问题
   */
  question: string
  /**
   * 回答
   */
  answer: string
  /**
   * 更新时间
   */
  updatedAt?: Date
}

export const teachSchema = new mongoose.Schema({
  question: { type: String, required: true, unique: true },
  answer: { type: String, required: true },
  updatedAt: Date,
})

export const Teach = mongoose.model<ITeach>('Teach', teachSchema)
