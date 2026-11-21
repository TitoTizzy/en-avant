import { randomUUID } from 'node:crypto';

export function validQuestion(q) {
  return q && typeof q.question === 'string' && q.question.length > 0 && q.question.length <= 1000
    && Array.isArray(q.options) && q.options.length === 4 && new Set(q.options).size === 4
    && q.options.every(option => typeof option === 'string' && option.length > 0 && option.length <= 1000)
    && q.options.includes(q.correct_answer)
    && typeof q.explication === 'string' && q.explication.length <= 3000
    && typeof q.source_livre_blanc === 'string' && q.source_livre_blanc.length <= 1000;
}

export async function createTriviaSession(supabase, questions) {
  const id = randomUUID();
  const { error } = await supabase.from('trivia_sessions').insert({ id, questions });
  if (error) throw error;
  // Never expose the answer key or explanations before an answer is locked.
  return { session_id: id, questions: questions.map(({ question, options }) => ({ question, options })) };
}
