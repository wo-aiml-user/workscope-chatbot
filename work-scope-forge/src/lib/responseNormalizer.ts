import type { ApiResponse } from "@/services/api";

export interface NormalizedAssistantPayload {
  content: unknown;
  current_stage: string;
  follow_up_question?: string;
}

const FENCED_JSON_REGEX = /```(?:json)?\s*([\s\S]*?)\s*```/i;

const tryParseJson = (value: string): unknown | null => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const extractJsonFromText = (text: string): unknown | null => {
  const fencedMatch = text.match(FENCED_JSON_REGEX);
  if (fencedMatch?.[1]) {
    const parsed = tryParseJson(fencedMatch[1].trim());
    if (parsed !== null) return parsed;
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const parsed = tryParseJson(text.substring(firstBrace, lastBrace + 1));
    if (parsed !== null) return parsed;
  }

  return null;
};

const normalizeFromUnknown = (value: unknown, fallbackStage = "general_chat"): NormalizedAssistantPayload => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const currentStage =
      typeof obj.current_stage === "string" && obj.current_stage.trim()
        ? obj.current_stage
        : fallbackStage;
    const followUp =
      typeof obj.follow_up_question === "string" && obj.follow_up_question.trim()
        ? obj.follow_up_question
        : undefined;

    if (Object.prototype.hasOwnProperty.call(obj, "content")) {
      return {
        content: obj.content,
        current_stage: currentStage,
        follow_up_question: followUp,
      };
    }

    return {
      content: obj,
      current_stage: currentStage,
      follow_up_question: followUp,
    };
  }

  if (Array.isArray(value)) {
    return {
      content: value,
      current_stage: "work_scope",
    };
  }

  return {
    content: value,
    current_stage: fallbackStage,
  };
};

export const normalizeApiResponse = (response: ApiResponse): NormalizedAssistantPayload => {
  const rawContent = response.content;
  const stage =
    typeof response.current_stage === "string" && response.current_stage.trim()
      ? response.current_stage
      : "general_chat";
  const followUp =
    typeof response.follow_up_question === "string" && response.follow_up_question.trim()
      ? response.follow_up_question
      : undefined;

  if (typeof rawContent !== "string") {
    return {
      content: rawContent,
      current_stage: stage,
      follow_up_question: followUp,
    };
  }

  const directParsed = tryParseJson(rawContent.trim());
  if (directParsed !== null) {
    const normalized = normalizeFromUnknown(directParsed, stage);
    if (!normalized.follow_up_question && followUp) {
      normalized.follow_up_question = followUp;
    }
    return normalized;
  }

  const extractedParsed = extractJsonFromText(rawContent);
  if (extractedParsed !== null) {
    const normalized = normalizeFromUnknown(extractedParsed, stage);
    if (!normalized.follow_up_question && followUp) {
      normalized.follow_up_question = followUp;
    }
    return normalized;
  }

  return {
    content: rawContent,
    current_stage: stage,
    follow_up_question: followUp,
  };
};

export const normalizeStoredMessage = (messageContent: string): NormalizedAssistantPayload => {
  const parsed = tryParseJson(messageContent);
  if (parsed !== null) {
    return normalizeFromUnknown(parsed);
  }

  return {
    content: messageContent,
    current_stage: "general_chat",
  };
};

export const assistantPayloadToDisplayText = (messageContent: string): string => {
  const payload = normalizeStoredMessage(messageContent);
  const { content } = payload;

  if (typeof content === "string") return content;
  if (typeof content === "number" || typeof content === "boolean") return String(content);
  if (content === null || content === undefined) return "";
  return JSON.stringify(content);
};
