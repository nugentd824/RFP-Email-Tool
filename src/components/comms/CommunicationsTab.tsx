"use client";

import type { ClientDetail } from "@/lib/types";
import { TemplateEditor } from "./TemplateEditor";

export function CommunicationsTab({
  client,
  onChanged,
}: {
  client: ClientDetail;
  onChanged: () => void;
}) {
  return (
    <div className="grid-2">
      {client.audiences.map((a) => (
        // Keyed on template version so external changes (copy-from, attachment
        // edits) remount the editor with fresh server state.
        <TemplateEditor
          key={`${a.id}:${a.template.version}`}
          client={client}
          audience={a}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}
