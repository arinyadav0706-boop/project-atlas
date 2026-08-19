// DTOs for custom fields (ADR-0042, docs/02_Modules/24_custom_fields.md).

export type CustomFieldTypeDto =
  | "TEXT"
  | "NUMBER"
  | "DATE"
  | "CHECKBOX"
  | "SELECT"
  | "MULTI_SELECT"
  | "USER"
  | "URL";

export const CUSTOM_FIELD_TYPES: readonly CustomFieldTypeDto[] = [
  "TEXT",
  "NUMBER",
  "DATE",
  "CHECKBOX",
  "SELECT",
  "MULTI_SELECT",
  "USER",
  "URL",
];

/** Which types own an option list. One predicate, so the UI and the validator agree. */
export function hasOptions(type: CustomFieldTypeDto): boolean {
  return type === "SELECT" || type === "MULTI_SELECT";
}

export interface CustomFieldOptionDto {
  id: string;
  label: string;
  position: number;
}

export interface CustomFieldDefinitionDto {
  id: string;
  name: string;
  type: CustomFieldTypeDto;
  description: string | null;
  required: boolean;
  options: CustomFieldOptionDto[];
  /** How many projects have enabled it — the "is this safe to delete" signal. */
  projectCount: number;
}

/**
 * A field as it appears ON an issue: the definition plus this issue's value.
 *
 * `value` is the normalised shape per type, so the client never has to know
 * which typed column it came out of:
 *   TEXT/URL    → string
 *   NUMBER      → number
 *   DATE        → ISO string
 *   CHECKBOX    → boolean
 *   SELECT      → option id
 *   MULTI_SELECT→ option ids
 *   USER        → user id
 */
export type CustomFieldValueDto = string | number | boolean | string[] | null;

export interface IssueCustomFieldDto {
  fieldId: string;
  name: string;
  type: CustomFieldTypeDto;
  description: string | null;
  required: boolean;
  options: CustomFieldOptionDto[];
  value: CustomFieldValueDto;
  /** Resolved for USER fields so the row can render a name without a lookup. */
  user: { id: string; name: string; avatarUrl: string | null } | null;
}

/** The project settings view: what is on, what is available. */
export interface ProjectCustomFieldsDto {
  enabled: CustomFieldDefinitionDto[];
  available: CustomFieldDefinitionDto[];
  canManage: boolean;
}
