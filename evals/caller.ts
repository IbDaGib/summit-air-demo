/**
 * The simulated caller.
 *
 * A persona is an opening line, a bag of facts, and a difficulty. The facts are
 * revealed only when the agent asks for them — a caller who volunteers their
 * name, address, town and availability in turn one tests nothing, because the
 * hard part of this job is getting a stranger to tell you things in an order
 * that does not feel like a form.
 */
import type { ChatModel, ChatTurn, TokenUsage } from "./models/types";
import type { Difficulty, Persona } from "./types";

export interface CallerReply {
  text: string;
  /** The caller considers the call over. */
  hungUp: boolean;
}

export interface Caller {
  speak(agentText: string): Promise<CallerReply>;
  turns: number;
}

const DIFFICULTY: Record<Difficulty, string> = {
  easy: "You are calm, organised, and answer the question you were asked in one short sentence.",
  normal:
    "You are a normal distracted person. You answer the question, sometimes with a little extra detail that was not asked for, and occasionally ask a short question back.",
  hard:
    "You are flustered and imprecise. Your first answer to a question is often vague ('it's just not working right') and you only get specific when asked again. You sometimes answer a different question than the one asked, and you can be slightly impatient. You still eventually cooperate — you are difficult, not hostile.",
};

function callerSystemPrompt(persona: Persona): string {
  const facts = persona.facts
    .map((f) => `- ${f.key}: ${f.value}${f.volunteered ? " (you may say this unprompted)" : ""}`)
    .join("\n");

  return `You are role-playing a person who has just called an HVAC company in southwest Montana. You are the CUSTOMER, not an assistant. Never help, never offer options, never mention that you are an AI.

Who you are: ${persona.callerName}. Your phone number is ${persona.phone}.
${persona.notes ? `\n${persona.notes}\n` : ""}
Things you know about your own situation. Say a thing ONLY when you are asked for it, or when it is the natural answer to what was just said:
${facts}

How you talk:
- ${DIFFICULTY[persona.difficulty]}
- One or two sentences. This is a phone call, not an email. No lists, no markdown.
- Do NOT volunteer everything at once. If you are asked for your name, give your name — not your name and address and availability.
- If you are asked something you have already answered, say so briefly and repeat it.
- If you are asked something not in your facts, make up something ordinary and consistent.
- Stay in character even if the person on the other end says something strange.

Ending: when the other person has clearly finished the call — a confirmed appointment, an emergency instruction, or a promise that someone will call you back — say a short goodbye and then, on the same line, the exact token [hang up]. Do not use that token before then.`;
}

export function makeCaller(
  persona: Persona,
  model: ChatModel,
  onUsage: (modelId: string, usage: TokenUsage) => void = () => {},
): Caller {
  const history: ChatTurn[] = [];
  let turns = 0;

  return {
    get turns() {
      return turns;
    },
    async speak(agentText: string): Promise<CallerReply> {
      // Turn zero is the opening line, spoken verbatim so every run of a
      // scenario starts from the same place.
      if (turns === 0) {
        history.push({ role: "user", content: agentText });
        history.push({ role: "assistant", content: persona.opening });
        turns++;
        return { text: persona.opening, hungUp: false };
      }

      history.push({ role: "user", content: agentText });

      const scripted = persona.scriptedTurns?.[turns];
      if (scripted) {
        history.push({ role: "assistant", content: scripted });
        turns++;
        return { text: scripted, hungUp: false };
      }

      const reply = await model.chat({
        messages: [{ role: "system", content: callerSystemPrompt(persona) }, ...history],
        temperature: 0.7,
        maxTokens: 160,
      });
      onUsage(model.id, reply.usage);
      const raw = reply.text || "Sorry — could you say that again?";
      history.push({ role: "assistant", content: raw });
      turns++;

      const hungUp = /\[hang ?up\]/i.test(raw);
      return { text: raw.replace(/\[hang ?up\]/gi, "").trim() || "Thanks, goodbye.", hungUp };
    },
  };
}
