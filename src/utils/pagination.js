export async function paginate(db, model, where, q, include) {
  const orderBy = [{ [q.sortBy]: q.sortOrder }, { id: "asc" }];
  const [data, total] = await db.$transaction([
    db[model].findMany({
      where,
      include,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy,
    }),
    db[model].count({ where }),
  ]);
  return { data, total, page: q.page, limit: q.limit };
}
