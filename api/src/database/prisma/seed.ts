import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const permissions = [
  ["business.create", "Create a managed business"],
  ["business.read", "View an accessible business"],
  ["business.update", "Update an accessible business"],
  ["business.credentials.reset", "Reset a business owner's credentials"],
  ["document.upload", "Upload documents"],
  ["document.read", "View accessible documents"],
  ["document.review", "Edit extracted document fields and warnings"],
  ["document.approve", "Approve documents and create book entries"],
  ["book.read", "View purchase and sales books"],
  ["export.create", "Generate books, reconciliation reports, and archives"],
  ["audit.read", "View audit events"],
  ["notification.read", "View and mark personal notifications as read"],
] as const;

const accountantPermissionCodes = permissions.map(([code]) => code);

const businessOwnerPermissionCodes = [
  "business.read",
  "document.upload",
  "document.read",
  "notification.read",
];

const upsertRoleWithPermissions = async (
  code: string,
  name: string,
  description: string,
  permissionCodes: readonly string[],
): Promise<void> => {
  const role = await prisma.role.upsert({
    where: { code },
    update: { name, description, isSystem: true },
    create: { code, name, description, isSystem: true },
  });

  const grantedPermissions = await prisma.permission.findMany({
    where: { code: { in: [...permissionCodes] } },
    select: { id: true },
  });

  await prisma.rolePermission.deleteMany({
    where: { roleId: role.id },
  });

  await prisma.rolePermission.createMany({
    data: grantedPermissions.map(({ id }) => ({
      roleId: role.id,
      permissionId: id,
    })),
  });
};

const seed = async (): Promise<void> => {
  await Promise.all(
    permissions.map(([code, description]) =>
      prisma.permission.upsert({
        where: { code },
        update: { description },
        create: { code, description },
      }),
    ),
  );

  await upsertRoleWithPermissions(
    "ACCOUNTANT",
    "Accountant",
    "Manages businesses, documents, books, exports, credentials, and audit records.",
    accountantPermissionCodes,
  );

  await upsertRoleWithPermissions(
    "BUSINESS_OWNER",
    "Business owner",
    "Uploads and views documents belonging to their business.",
    businessOwnerPermissionCodes,
  );
};

seed()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
