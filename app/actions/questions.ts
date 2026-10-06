'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase/server';
import { readUser } from '@/lib/auth';
import * as qa from '@/lib/data/questions';
import { DataError } from '@/lib/data/errors';
import type { ActionResult } from './review';

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    if (err instanceof DataError) return { ok: false, code: err.code, message: err.message };
    throw err;
  }
}

async function requireUser() {
  const user = await readUser();
  if (!user) throw new DataError('not_authenticated');
  return user;
}

export async function askQuestion(productId: string, body: string): Promise<ActionResult<{ question: qa.Question }>> {
  return run(async () => {
    const user = await requireUser();
    const question = await qa.askQuestion(await db(), productId, user.id, body);
    revalidatePath(`/product/${productId}`);
    return { question };
  });
}

export async function answerQuestion(productId: string, questionId: string, body: string): Promise<ActionResult<{ answer: qa.Answer }>> {
  return run(async () => {
    const user = await requireUser();
    const answer = await qa.answerQuestion(await db(), questionId, user.id, body);
    revalidatePath(`/product/${productId}`);
    return { answer };
  });
}

export async function removeQuestion(productId: string, questionId: string): Promise<ActionResult<object>> {
  return run(async () => {
    await requireUser();
    await qa.deleteQuestion(await db(), questionId);
    revalidatePath(`/product/${productId}`);
    return {};
  });
}

export async function removeAnswer(productId: string, answerId: string): Promise<ActionResult<object>> {
  return run(async () => {
    await requireUser();
    await qa.deleteAnswer(await db(), answerId);
    revalidatePath(`/product/${productId}`);
    return {};
  });
}

export async function toggleAnswerHelpful(answerId: string): Promise<ActionResult<qa.AnswerHelpfulState>> {
  return run(async () => {
    await requireUser();
    return qa.toggleAnswerHelpful(await db(), answerId);
  });
}

/** A page of a product's questions, optionally only those matching `q`. */
export async function loadQuestions(productId: string, q = '', offset = 0, limit = 10): Promise<ActionResult<qa.QuestionPage>> {
  return run(async () => {
    const user = await readUser();
    return qa.listQuestions(await db(), productId, user?.id ?? null, { q, offset, limit });
  });
}
