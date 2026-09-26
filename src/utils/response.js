export const success = (res, data, status = 200) =>
  res.status(status).json({ success: true, data });
export const paginated = (res, { data, total, page, limit }) =>
  res.json({
    success: true,
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
export const requestContext = (req) => ({
  ip: req.ip,
  userAgent: (req.get("user-agent") || "").slice(0, 250),
});
