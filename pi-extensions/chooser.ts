import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// Always appended to every panel: the free-text escape hatch.
const OTHER = "✎ Other… (type your reply)";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "choose",
    label: "Choose",
    description:
      "Show the user an interactive selection panel (arrow keys + enter, esc cancels). " +
      "A 'Other… (type your reply)' option is always appended last: selecting it opens a " +
      "free-text input so the user can reply in their own words (questions, corrections, " +
      "style requests like 'simpler, less jargon').",
    parameters: Type.Object({
      title: Type.String({ description: "Panel title / question" }),
      options: Type.Array(Type.String(), { description: "Choices, one per entry" }),
      multiHint: Type.Optional(Type.String({
        description: "Optional hint shown before the title (context line, not a choice)",
      })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const opts = [...params.options, OTHER];

      const title = params.multiHint
        ? `${params.multiHint}\n${params.title}`
        : params.title;
      const choice = await ctx.ui.select(title, opts);

      if (choice === undefined) {
        return { content: [{ type: "text", text: "(cancelled)" }], details: {} };
      }

      if (choice === OTHER) {
        const reply = await ctx.ui.input(
          "Your reply:",
          "type anything — a question, a correction, or how you want the answer (e.g. 'simpler, less jargon')",
        );
        if (reply === undefined || reply.trim() === "") {
          return { content: [{ type: "text", text: "(cancelled)" }], details: {} };
        }
        return {
          content: [{ type: "text", text: `OTHER — ${reply}` }],
          details: { choice: "other", reply },
        };
      }

      return { content: [{ type: "text", text: choice }], details: { choice } };
    },
  });
}
