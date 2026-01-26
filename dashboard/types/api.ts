export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  filterOptions?: Record<string, (string | number)[]>;
};

export type ModelListParams = {
  page: number;
  limit: number;
  search: string;
  [key: string]: string | number | undefined;
};
