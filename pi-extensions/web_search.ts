// web_search via local SearXNG (localhost:8080). Read-only: HTTP GET to the
// local metasearch API only; the engine does all external fetching.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const SEARXNG = "http://localhost:8080/search";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "web_search",
    label: "Web search",
    description:
      "Search the web via the local SearXNG metasearch instance. Read-only. " +
      "Returns the top results (title, url, snippet, engine). Use for external " +
      "research (docs, best practices, prior art). Results hold short snippets " +
      "from the search engines only; to read a full page, pass its url to the " +
      "web_fetch tool. If the local instance is down, the tool reports that.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      count: Type.Optional(Type.Number({ description: "Max results (default 8, max 20)" })),
    }),
    async execute(_id, params, signal) {
      const n = Math.min(Math.max(params.count ?? 8, 1), 20);
      const url = `${SEARXNG}?q=${encodeURIComponent(params.query)}&format=json`;
      try {
        const res = await fetch(url, { signal });
        if (!res.ok) {
          return {
            content: [{ type: "text", text: `(search unavailable: HTTP ${res.status})` }],
            details: {},
          };
        }
        const data = (await res.json()) as {
          results?: Array<{
            title?: string;
            url?: string;
            content?: string;
            engine?: string;
          }>;
        };
        const results = (data.results ?? []).slice(0, n).map((r) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          snippet: (r.content ?? "").slice(0, 600),
          engine: r.engine ?? "",
        }));
        if (results.length === 0) {
          return { content: [{ type: "text", text: "(no results)" }], details: {} };
        }
        const text = results
          .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url} [${r.engine}]\n   ${r.snippet}`)
          .join("\n\n");
        return { content: [{ type: "text", text }], details: { results } };
      } catch (e) {
        return {
          content: [{ type: "text", text: `(search error: ${String(e).slice(0, 200)})` }],
          details: {},
        };
      }
    },
  });
}
