export const appendAudit = (
  tx,
  user,
  action,
  entity,
  entityId,
  metadata = {},
  ctx = {},
) =>
  tx.auditLog.create({
    data: {
      actorId: user.id,
      action,
      entity,
      entityId,
      metadata,
      ipAddress: ctx.ip,
    },
  });
