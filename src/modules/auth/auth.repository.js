export const authRepository = (db) => ({
  findByEmail: (email) =>
    db.user.findUnique({
      where: { email },
      include: { role: true, memberships: { select: { teamId: true } } },
    }),
  findSession: (tokenHash) =>
    db.refreshSession.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: { role: true, memberships: { select: { teamId: true } } },
        },
      },
    }),
});
