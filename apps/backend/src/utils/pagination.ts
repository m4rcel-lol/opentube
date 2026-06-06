export function pagination(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    skip: (page - 1) * pageSize,
    take: pageSize
  };
}
