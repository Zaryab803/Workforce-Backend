export const publicUserSelect = {
  id: true,
  employeeCode: true,
  name: true,
  email: true,
  phone: true,
  role: { select: { name: true } },
  managerId: true,
  joiningDate: true,
  employmentStatus: true,
  avatarUrl: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  memberships: { select: { teamId: true } },
};

export const personSelect = { id: true, name: true, avatarUrl: true };

export function serializeUser(u) {
  if (!u) return null;
  const roleName = u.role?.name || (typeof u.role === "string" ? u.role : "EMPLOYEE");
  const teamIds = u.memberships?.map((m) => m.teamId) || u.teamIds || [];
  const joinedDate = u.joiningDate
    ? typeof u.joiningDate === "string"
      ? u.joiningDate.slice(0, 10)
      : new Date(u.joiningDate).toISOString().slice(0, 10)
    : "";

  return {
    ...u,
    role: roleName,
    teamIds,
    teamId: teamIds[0] || "",
    avatar: u.avatarUrl || u.avatar || "",
    avatarUrl: u.avatarUrl || u.avatar || "",
    joined: joinedDate,
    joiningDate: joinedDate,
    active: u.isActive !== undefined ? u.isActive : true,
    isActive: u.isActive !== undefined ? u.isActive : true,
    position: u.employmentStatus || "Software Engineer",
    memberships: undefined,
  };
}
