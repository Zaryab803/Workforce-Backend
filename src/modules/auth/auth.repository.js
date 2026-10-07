import { publicUserSelect } from "../../utils/user.js";

// Authentication must also work before optional feature migrations are released.
export const authUserSelect = {
  ...publicUserSelect,
  passwordHash: true,
  tokenVersion: true,
  deletedAt: true,
};

export const authRepository = (db) => ({
  findByEmail: (email) =>
    db.user.findUnique({
      where: { email },
      select: authUserSelect,
    }),
  findSession: (tokenHash) =>
    db.refreshSession.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: authUserSelect,
        },
      },
    }),
});
