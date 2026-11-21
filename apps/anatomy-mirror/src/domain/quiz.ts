import { QUIZ_BONES, QUIZ_MUSCLES, structure } from './structures.ts'
import type { BoneId, MuscleId, StructureId } from './types.ts'

export const QUESTION_MS = 15_000
export const REVEAL_MS = 2_000

export type Question =
  | { kind: 'touch'; id: BoneId; prompt: string }
  | { kind: 'show'; id: MuscleId; prompt: string }

export type QuizPhase = 'ask' | 'reveal' | 'done'

export type Miss = { id: StructureId; prompt: string }

export type QuizState = {
  questions: Question[]
  index: number
  phase: QuizPhase
  startedAt: number
  questionStartedAt: number
  score: number
  elapsedMs: number
  misses: Miss[]
  muscleCorrect: number
  muscleAsked: number
  revealCorrect: boolean
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const a = copy[i]!
    copy[i] = copy[j]!
    copy[j] = a
  }
  return copy
}

export function drawQuiz(rng: () => number = Math.random): Question[] {
  const bones = shuffle(QUIZ_BONES, rng).slice(0, 3)
  const muscles = shuffle(QUIZ_MUSCLES, rng).slice(0, 2)
  const questions: Question[] = [
    ...bones.map((id) => ({ kind: 'touch' as const, id, prompt: structure(id).touchPrompt })),
    ...muscles.map((id) => ({ kind: 'show' as const, id, prompt: `Show me your ${structure(id).everyday.toLowerCase()}.` })),
  ]
  return shuffle(questions, rng)
}

/** 1 point for a hit, plus up to 1 more for answering early. Wrong is 0. */
export function pointsFor(correct: boolean, elapsedMs: number, limitMs = QUESTION_MS): number {
  if (!correct) return 0
  const remain = Math.max(0, Math.min(1, (limitMs - elapsedMs) / limitMs))
  return 1 + remain
}

export function startQuiz(now: number, rng?: () => number): QuizState {
  const questions = drawQuiz(rng)
  return {
    questions,
    index: 0,
    phase: 'ask',
    startedAt: now,
    questionStartedAt: now,
    score: 0,
    elapsedMs: 0,
    misses: [],
    muscleCorrect: 0,
    muscleAsked: questions.filter((q) => q.kind === 'show').length,
    revealCorrect: false,
  }
}

export function remainingMs(quiz: QuizState, now: number): number {
  if (quiz.phase !== 'ask') return 0
  return Math.max(0, QUESTION_MS - (now - quiz.questionStartedAt))
}

export function answerQuestion(quiz: QuizState, correct: boolean, now: number): QuizState {
  const question = quiz.questions[quiz.index]
  if (!question || quiz.phase !== 'ask') return quiz
  const elapsed = now - quiz.questionStartedAt
  const gained = pointsFor(correct, elapsed)
  const misses = correct ? quiz.misses : [...quiz.misses, { id: question.id, prompt: question.prompt }]
  return {
    ...quiz,
    phase: 'reveal',
    score: quiz.score + gained,
    elapsedMs: quiz.elapsedMs + Math.min(elapsed, QUESTION_MS),
    misses,
    muscleCorrect: quiz.muscleCorrect + (question.kind === 'show' && correct ? 1 : 0),
    revealCorrect: correct,
    questionStartedAt: now,
  }
}

export function advanceQuiz(quiz: QuizState, now: number): QuizState {
  if (quiz.phase !== 'reveal') return quiz
  const next = quiz.index + 1
  if (next >= quiz.questions.length) {
    return { ...quiz, phase: 'done', index: next }
  }
  return { ...quiz, phase: 'ask', index: next, questionStartedAt: now, revealCorrect: false }
}
