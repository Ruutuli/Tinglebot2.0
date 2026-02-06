// ============================================================================
// ------------------- Model Configuration Types -------------------
// TypeScript types for model configurations used in the database editor
// ============================================================================

export type FieldType = 
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "multiselect"
  | "array"
  | "toggle-grid"
  | "date"
  | "custom";

export type FieldConfig = {
  key: string;
  label: string;
  type: FieldType;
  helpText?: string;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string | number; label: string }>;
  min?: number;
  max?: number;
  disabled?: boolean;
  // For toggle-grid
  columns?: number;
  groupTitle?: string;
  // For custom components
  component?: string;
  // For conditional display
  showIf?: (data: Record<string, unknown>) => boolean;
  // For dynamic label/helpText
  getLabel?: (data: Record<string, unknown>) => string;
  getHelpText?: (data: Record<string, unknown>) => string;
  // For array fields
  readOnly?: boolean;
  autoPopulated?: boolean;
};

export type TabConfig = {
  id: string;
  label: string;
  icon: string;
  fields: FieldConfig[];
  gridColumns?: number; // Optional: render fields in a grid layout (e.g., 2 for double columns)
};

export type ModelConfig = {
  name: string;
  displayName: string;
  icon: string;
  collection: string;
  // Primary field for display/search
  nameField: string;
  // Default sort field
  sortField: string;
  // Filter options keys (for API)
  filterKeys: string[];
  // Tabs configuration
  tabs: TabConfig[];
  // Custom list component (optional)
  listComponent?: string;
  // Custom editor component (optional - if not using GenericEditorForm)
  editorComponent?: string;
};

export type ModelConfigMap = Record<string, ModelConfig>;
