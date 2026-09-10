// ════════════════════════════════════════════════════════════════════
// Bug Dashboard v2 — fonction serveur « bug-radar-ai »
//
// Rédige la synthèse « lecture de la direction » d'une analyse, ou répond
// à une question libre sur les données de l'analyse courante. La clé
// Anthropic reste ici, côté serveur (secret ANTHROPIC_API_KEY de la
// fonction) : la page web n'y a jamais accès.
//
// Sécurité : la passerelle Supabase exige un JWT valide (verify_jwt) ; on
// vérifie en plus que le compte est actif (profils.actif) via la fonction
// SQL compte_actif() appelée avec le jeton de l'appelant.
//
// Déploiement : Supabase → Edge Functions (déjà fait via le connecteur).
// Secret à définir une fois : Edge Functions → bug-radar-ai → Secrets →
// ANTHROPIC_API_KEY. Tant qu'il manque, la fonction répond
// { setup: true } et le dashboard affiche la marche à suivre.
// ════════════════════════════════════════════════════════════════════
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Modèles autorisés (le moins coûteux par défaut, décision fonctionnelle).
const MODELS: Record<string, { thinking: boolean }> = {
  "claude-haiku-4-5": { thinking: false },
  "claude-sonnet-5": { thinking: true },
  "claude-opus-5": { thinking: true },
};
const DEFAULT_MODEL = "claude-haiku-4-5";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function systemPrompt(tone: string) {
  const audience = tone === "projet"
    ? "un chef de projet qui veut des actions concrètes, ticket par ticket quand c'est utile"
    : "un directeur de programme qui a trente secondes : décisionnel, chiffré, sans jargon technique";
  return [
    "Tu es « Radar », l'analyste du Bug Dashboard d'une équipe de stabilisation logicielle (assurance).",
    `Tu écris en français, pour ${audience}.`,
    "Tu ne travailles qu'avec les données JSON fournies : n'invente aucun chiffre, aucun ticket, aucune date. Si une information manque, dis-le en une ligne.",
    "Tout est compté en nombre de tickets (les bugs n'ont pas de points). L'« avancement pondéré » est un indicateur secondaire calculé à partir des statuts.",
    "Vocabulaire : « PRJ301 » = tickets de test fournis par le projet de test (étiquette SourceProject_PRJ301) ; les autres sont des bugs internes. « Stock à livrer » = tickets non terminés rattachés à une version. « Retard réel » = tickets ouverts sur une version déjà déployée.",
    "Cite les clés de tickets telles quelles (ex. POLC-123) : le dashboard les transforme en liens.",
    "Format : Markdown léger — titres « ### », listes à puces courtes, gras pour les chiffres clés. Pas de tableau, pas de code.",
  ].join("\n");
}

function summaryInstructions(tone: string) {
  return tone === "projet"
    ? "Rédige une synthèse structurée : ### Situation (3 puces chiffrées) · ### Ce qui a bougé depuis la dernière analyse (si des deltas sont fournis, sinon omets) · ### Risques par version (train de livraison : versions imminentes, stock, blockers, retard réel) · ### Actions proposées (5 max, chacune avec les tickets ou l'équipe concernés) · ### Points d'attention PRJ301. 250 à 400 mots."
    : "Rédige une lecture pour la direction en 150 à 250 mots : ### En une phrase (l'état global, chiffré) · ### Ce qui a bougé (si des deltas sont fournis, sinon omets) · ### Les 3 risques majeurs (version, équipe, chiffres, tickets clés) · ### Questions à poser en comité (3 max). Ton factuel, décisionnel.";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  // ── Compte actif ? ────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Session requise" }, 401);
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: actif, error } = await supabase.rpc("compte_actif");
    if (error || !actif) return json({ error: "Compte inactif ou session invalide" }, 403);
  } catch (e) {
    return json({ error: "Vérification du compte impossible : " + (e as Error).message }, 500);
  }

  // ── Clé Anthropic ─────────────────────────────────────────────────
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ setup: true, error: "Le secret ANTHROPIC_API_KEY n'est pas configuré sur la fonction bug-radar-ai." });

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Corps JSON invalide" }, 400); }
  const mode = body.mode === "ask" ? "ask" : "summary";
  const model = MODELS[body.model] ? body.model : DEFAULT_MODEL;
  const tone = body.tone === "projet" ? "projet" : "direction";
  const context = body.context ?? {};
  const question = String(body.question ?? "").slice(0, 2000);
  if (mode === "ask" && !question.trim()) return json({ error: "Question vide" }, 400);

  const contextText = JSON.stringify(context);
  if (contextText.length > 400_000) return json({ error: "Contexte trop volumineux" }, 413);

  const userText = mode === "summary"
    ? `${summaryInstructions(tone)}\n\nDonnées de l'analyse (JSON) :\n${contextText}`
    : `Réponds à la question ci-dessous en t'appuyant uniquement sur les données JSON de l'analyse. Réponse courte et structurée (Markdown léger, puces), cite les clés de tickets concernées quand elles existent dans les données ; si la réponse n'est pas dans les données, dis-le.\n\nQuestion : ${question}\n\nDonnées de l'analyse (JSON) :\n${contextText}`;

  try {
    const client = new Anthropic({ apiKey });
    const params: Record<string, unknown> = {
      model,
      max_tokens: 2500,
      system: systemPrompt(tone),
      messages: [{ role: "user", content: userText }],
    };
    if (MODELS[model].thinking) params.thinking = { type: "adaptive" };
    const response = await client.messages.create(params as any);
    if ((response as any).stop_reason === "refusal") return json({ error: "Le modèle a décliné la demande." });
    const text = response.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    return json({ text, model, usage: response.usage, stop_reason: response.stop_reason });
  } catch (e) {
    const err = e as any;
    const status = err?.status ?? 500;
    return json({ error: "Appel au modèle refusé (" + status + ") : " + (err?.message ?? String(e)) }, 502);
  }
});
