import type { AuthenticatedUser, PublicUser } from "../../shared/types/auth";

export const toPublicUser = (user: AuthenticatedUser): PublicUser => {
  const profile = user.accountantProfile
    ? {
        type: "ACCOUNTANT" as const,
        firstName: user.accountantProfile.firstName,
        lastName: user.accountantProfile.lastName,
      }
    : user.businessOwnerProfile
      ? {
          type: "BUSINESS_OWNER" as const,
          businessId: user.businessOwnerProfile.businessId,
        }
      : null;

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    mustChangePassword: user.mustChangePassword,
    locale: user.locale,
    roles: user.roles,
    permissions: user.permissions,
    profile,
    createdAt: user.createdAt.toISOString(),
  };
};
