// Merge-field rendering. Pure functions shared by the browser (previews) and
// the server (actual sends) so what you preview is exactly what goes out.

export type MergeContext = {
  firstName: string;
  lastName: string;
  supplierCompany: string;
  clientName: string;
  title: string;
  category: string;
  email: string;
};

export const MERGE_FIELDS: { token: string; key: keyof MergeContext; label: string }[] = [
  { token: "{{FirstName}}", key: "firstName", label: "First name" },
  { token: "{{LastName}}", key: "lastName", label: "Last name" },
  { token: "{{SupplierCompany}}", key: "supplierCompany", label: "Supplier company" },
  { token: "{{ClientName}}", key: "clientName", label: "Client name" },
  { token: "{{Title}}", key: "title", label: "Contact title" },
  { token: "{{Category}}", key: "category", label: "Category / commodity" },
];

const KEY_BY_NAME: Record<string, keyof MergeContext> = {
  firstname: "firstName",
  lastname: "lastName",
  suppliercompany: "supplierCompany",
  company: "supplierCompany",
  clientname: "clientName",
  title: "title",
  category: "category",
  email: "email",
};

const TOKEN_RE = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

export function renderMerge(text: string, ctx: MergeContext): string {
  return text.replace(TOKEN_RE, (whole, name: string) => {
    const key = KEY_BY_NAME[name.toLowerCase()];
    return key ? ctx[key] : whole;
  });
}

// Tokens that look like merge fields but won't be replaced (typos like
// {{FirsName}}). Surfaced as a pre-send checklist warning.
export function unknownTokens(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(TOKEN_RE)) {
    if (!KEY_BY_NAME[m[1].toLowerCase()]) out.add(m[0]);
  }
  return [...out];
}

export function contactMergeContext(
  c: { firstName: string; lastName: string; company: string; title: string; category: string; email: string },
  clientName: string
): MergeContext {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    supplierCompany: c.company,
    clientName,
    title: c.title,
    category: c.category,
    email: c.email,
  };
}
