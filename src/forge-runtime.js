import { createClient } from "@supabase/supabase-js";

const FORGE_FUNCTION = "bridge-anvil-generate";
const DEFAULT_MAX_TOKENS = 1500;
const MIN_MAX_TOKENS = 256;
const MAX_MAX_TOKENS = 4096;
const MAX_PROMPT_CHARS = 20000;

const forgeUrl =
  import.meta.env.VITE_FORGE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL ||
  "";
const forgePublishableKey =
  import.meta.env.VITE_FORGE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";

export const forgeRuntimeConfigured = Boolean(
  forgeUrl && forgePublishableKey,
);

export const forge = forgeRuntimeConfigured
  ? createClient(forgeUrl, forgePublishableKey, {
      auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "implicit",
      },
    })
  : null;

function normalizeSystem(system) {
  if (system == null) return null;
  if (typeof system === "string") return system;
  if (!Array.isArray(system)) {
    throw new Error("System guidance must be text or text blocks.");
  }
  return system
    .filter(
      (block) =>
        block &&
        typeof block === "object" &&
        block.type === "text" &&
        typeof block.text === "string",
    )
    .map((block) => block.text)
    .join("\n");
}

export function normalizeAnvilGenerationRequest(
  prompt,
  maxTokens = DEFAULT_MAX_TOKENS,
  system = null,
  requestId = crypto.randomUUID(),
) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("A generation prompt is required.");
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new Error("The generation prompt is too long.");
  }
  const requested = Number.parseInt(String(maxTokens), 10);
  const normalizedMaxTokens = Math.min(
    Math.max(
      Number.isFinite(requested) ? requested : DEFAULT_MAX_TOKENS,
      MIN_MAX_TOKENS,
    ),
    MAX_MAX_TOKENS,
  );
  return {
    requestId,
    prompt,
    maxTokens: normalizedMaxTokens,
    ...(system == null ? {} : { system: normalizeSystem(system) }),
  };
}

export async function getForgeSession() {
  if (!forge) return null;
  const {
    data: { session },
  } = await forge.auth.getSession();
  return session;
}

export function onForgeAuthStateChange(callback) {
  if (!forge) return () => {};
  const {
    data: { subscription },
  } = forge.auth.onAuthStateChange((_event, session) => callback(session));
  return () => subscription.unsubscribe();
}

export async function signInToForge(email, password) {
  if (!forge) {
    throw new Error(
      "Forge runtime is not configured. Set the Forge Supabase public environment.",
    );
  }
  const { data, error } = await forge.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return data.session;
}

export async function signOutOfForge() {
  if (!forge) return;
  const { error } = await forge.auth.signOut();
  if (error) throw error;
}

export function extractAnvilGenerationOutput(data) {
  if (!data || typeof data.output !== "string" || !data.output.trim()) {
    throw new Error("Forge returned an invalid generation response.");
  }
  return data.output;
}

export async function requestForgeGeneration(
  prompt,
  maxTokens = DEFAULT_MAX_TOKENS,
  system = null,
) {
  if (!forge) {
    throw new Error(
      "Forge runtime is not configured. Set the Forge Supabase public environment.",
    );
  }
  const session = await getForgeSession();
  if (!session) {
    throw new Error("Your Forge session expired. Sign in again.");
  }
  const body = normalizeAnvilGenerationRequest(prompt, maxTokens, system);
  const { data, error } = await forge.functions.invoke(FORGE_FUNCTION, {
    body,
  });
  if (error) {
    const context = error.context;
    let detail = "";
    if (context && typeof context.json === "function") {
      try {
        const payload = await context.json();
        detail =
          typeof payload?.error === "string" ? payload.error : "";
      } catch {
        detail = "";
      }
    }
    throw new Error(detail || error.message || "Forge generation failed.");
  }
  return extractAnvilGenerationOutput(data);
}
