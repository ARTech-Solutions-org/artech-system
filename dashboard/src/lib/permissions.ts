import type { Msg } from "@/lib/i18n";

export const DEPARTMENTS = ["business", "accounting", "development", "operations"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export type Viewer = {
  id: string;
  department: Department | null;
  isHead: boolean;
  isSuperAdmin: boolean;
};

export const DEPARTMENT_LABELS = {
  business: "Business",
  accounting: "Accounting",
  development: "Development",
  operations: "Operations",
} as const satisfies Record<Department, Msg>;

const HEAD_TITLES: Record<Department, Msg> = {
  business: "Business Head",
  accounting: "Accountant Manager",
  development: "Tech Head",
  operations: "Operations Manager",
};

const MEMBER_TITLES: Record<Department, Msg> = {
  business: "Business",
  accounting: "Accountant",
  development: "Developer",
  operations: "Operations",
};

export function roleTitle(v: Pick<Viewer, "department" | "isHead" | "isSuperAdmin">): Msg {
  if (v.isSuperAdmin) return "Super Admin";
  if (!v.department) return "No department";
  return v.isHead ? HEAD_TITLES[v.department] : MEMBER_TITLES[v.department];
}

const isTechHead = (v: Viewer) => v.department === "development" && v.isHead;
const isDeveloper = (v: Viewer) => v.department === "development" && !v.isHead;

// Users

export function canManageUsersIn(v: Viewer, dept: Department | null): boolean {
  if (v.isSuperAdmin) return true;
  return v.isHead && dept !== null && v.department === dept;
}

export function canManageAnyUsers(v: Viewer): boolean {
  return v.isSuperAdmin || v.isHead;
}

/** Only the super admin appoints department heads. */
export function canSetHead(v: Viewer): boolean {
  return v.isSuperAdmin;
}

/** Heads may manage regular members of their department, never other heads or the super admin. */
export function canManageUser(
  v: Viewer,
  target: Pick<Viewer, "id" | "department" | "isHead" | "isSuperAdmin">,
): boolean {
  if (v.isSuperAdmin) return true;
  if (target.isSuperAdmin || target.isHead) return false;
  return canManageUsersIn(v, target.department);
}

// Projects

export function canSeeAllProjects(v: Viewer): boolean {
  return !isDeveloper(v);
}

export function canViewProject(v: Viewer, isMember: boolean): boolean {
  return canSeeAllProjects(v) || isMember;
}

export function canEditBrief(v: Viewer): boolean {
  return v.isSuperAdmin || v.department === "business";
}

export function canViewBudget(v: Viewer): boolean {
  return v.isSuperAdmin || v.department === "business" || v.department === "accounting" || isTechHead(v);
}

export function canEditBudget(v: Viewer): boolean {
  return v.isSuperAdmin || v.department === "business" || v.department === "accounting";
}

/** Record payments received and expenses. */
export function canManageFinance(v: Viewer): boolean {
  return v.isSuperAdmin || v.department === "accounting";
}

export function canExportProjects(v: Viewer): boolean {
  return v.isSuperAdmin || (v.isHead && (v.department === "business" || v.department === "accounting"));
}

export function canViewInstallationDate(v: Viewer): boolean {
  return (
    v.isSuperAdmin ||
    v.department === "business" ||
    v.department === "accounting" ||
    v.department === "operations" ||
    isTechHead(v)
  );
}

export function canEditInstallationDate(v: Viewer): boolean {
  return v.isSuperAdmin || v.department === "business";
}

/** Assign developers, set the development deadline and milestones, add members mid-project. */
export function canAssign(v: Viewer): boolean {
  return v.isSuperAdmin || isTechHead(v);
}

/** Developers working on the project, plus the Tech Head: milestones, installation guide, status moves. */
export function canWorkOnProject(v: Viewer, isMember: boolean): boolean {
  return v.isSuperAdmin || isTechHead(v) || (v.department === "development" && isMember);
}

/** Add equipment, change stock and status. */
export function canManageEquipment(v: Viewer): boolean {
  return v.isSuperAdmin || (v.isHead && (v.department === "development" || v.department === "operations"));
}

/** The department that must act, the person who raised it, the Tech Head, or the super admin. */
/** A recipient resolves their own part of a flag; their department head can resolve it for them. */
export function canResolveFlagPart(v: Viewer, recipient: { id: string; department: Department | null }): boolean {
  return (
    v.isSuperAdmin || v.id === recipient.id || (v.isHead && !!v.department && v.department === recipient.department)
  );
}

export function canCancelFlag(v: Viewer, flag: { raisedBy: string }): boolean {
  return v.isSuperAdmin || v.id === flag.raisedBy;
}

export function canRequestEquipment(v: Viewer): boolean {
  return v.isSuperAdmin || v.department === "development" || v.department === "operations";
}

export function canWriteInstallationGuide(v: Viewer): boolean {
  return v.isSuperAdmin || v.department === "development";
}

export function canManageInstallation(v: Viewer): boolean {
  return v.isSuperAdmin || v.department === "operations";
}
