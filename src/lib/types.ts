// DTO shapes shared between API routes and client components.

export type SendStatus = "NOT_SENT" | "PARTIAL" | "SENT";
export type ClientStatus = "SETUP" | "IN_PROGRESS" | "COMPLETE";

export type AttachmentMeta = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export type TemplateDTO = {
  id: string;
  subject: string;
  bodyHtml: string;
  version: number;
  noAttachmentConfirmed: boolean;
  updatedAt: string;
  attachments: AttachmentMeta[];
};

export type AudienceDTO = {
  id: string;
  key: string;
  label: string;
  targetSendDate: string;
  bccEmails: string;
  assignedCount: number;
  sentCount: number;
  sendStatus: SendStatus;
  template: TemplateDTO;
};

export type ClientSummary = {
  id: string;
  name: string;
  engagement: string;
  status: ClientStatus;
  totalContacts: number;
  assignedContacts: number;
  unassignedContacts: number;
  audiences: Pick<AudienceDTO, "id" | "key" | "label" | "targetSendDate" | "assignedCount" | "sentCount" | "sendStatus">[];
};

export type ClientDetail = {
  id: string;
  name: string;
  engagement: string;
  notes: string;
  status: ClientStatus;
  audiences: AudienceDTO[];
};

export type ContactDTO = {
  id: string;
  audienceId: string | null;
  company: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  category: string;
  notes: string;
  emailValid: boolean;
  duplicateOfId: string | null;
};

export type SendLogDTO = {
  id: string;
  contactId: string | null;
  audienceId: string | null;
  toEmail: string;
  contactName: string;
  audienceLabel: string;
  subject: string;
  templateVersion: number;
  status: "SENT" | "FAILED";
  isTest: boolean;
  error: string;
  sentAt: string;
};

// Excel import wire format: one mapped+cleaned row.
export type ImportRow = {
  company: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  category: string;
  notes: string;
};

export type ImportDiff = {
  news: ImportRow[];
  changed: {
    contactId: string;
    email: string;
    existing: ImportRow;
    incoming: ImportRow;
    fields: (keyof ImportRow)[];
  }[];
  unchangedCount: number;
};

export type TemplateSource = {
  audienceId: string;
  clientName: string;
  engagement: string;
  audienceLabel: string;
  subject: string;
  version: number;
  attachmentCount: number;
  updatedAt: string;
};
