/**
 * Single source of truth for the OpenAI Realtime session shape we ship to
 * /v1/realtime/client_secrets. Per Codex review (PLAN §14.1):
 *  - field is `output_modalities`, not `modalities`
 *  - cannot request audio + text simultaneously; ["audio"] gives audio + transcripts
 *  - default to `semantic_vad` for natural conversation
 *  - `voice` cannot change after first audio emission, so it must be set here
 *
 * Instructions and tools are intentionally NOT sent at mint time; the client
 * sends them via session.update once the data channel opens, so we can refresh
 * them mid-conversation (e.g. when Google Calendar context arrives).
 */
export const REALTIME_MODEL = "gpt-realtime-2.1";
export const REALTIME_VOICE = "marin";

export const REALTIME_SESSION_CONFIG = {
  type: "realtime" as const,
  model: REALTIME_MODEL,
  output_modalities: ["audio"] as const,
  audio: {
    input: {
      transcription: { model: "gpt-transcribe" },
      turn_detection: {
        type: "semantic_vad" as const,
        eagerness: "high" as const,
        create_response: true,
        interrupt_response: true,
      },
    },
    output: {
      voice: REALTIME_VOICE,
    },
  },
};
