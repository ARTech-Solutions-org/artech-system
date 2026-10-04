import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import {
  canManageAnyUsers,
  canManageUser,
  canSetHead,
  DEPARTMENT_LABELS,
  DEPARTMENTS,
  roleTitle,
} from "@/lib/permissions";
import { CreateUserForm } from "./create-user-form";

export default async function UsersPage() {
  const me = await requireUser();
  if (!canManageAnyUsers(me)) redirect("/");

  const query = db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      department: users.department,
      isHead: users.isHead,
      isSuperAdmin: users.isSuperAdmin,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .orderBy(desc(users.isSuperAdmin), asc(users.department), desc(users.isHead), asc(users.name));
  const rows = me.isSuperAdmin ? await query : await query.where(eq(users.department, me.department!));

  const departments = me.isSuperAdmin ? [...DEPARTMENTS] : [me.department!];

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-muted-foreground">
          {me.isSuperAdmin ? "All departments" : `${DEPARTMENT_LABELS[me.department!]} department`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add member</CardTitle>
          <CardDescription>The new member signs in with this temporary password and must change it.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateUserForm departments={departments} canSetHead={canSetHead(me)} />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {canManageUser(me, u) ? (
                      <Link href={`/users/${u.id}`} className="underline-offset-4 hover:underline">
                        {u.name}
                      </Link>
                    ) : (
                      u.name
                    )}
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{roleTitle(u)}</TableCell>
                  <TableCell>
                    <Badge variant={u.status === "active" ? "secondary" : "destructive"}>{u.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.lastLoginAt ? u.lastLoginAt.toLocaleString("en-GB", { timeZone: "Africa/Cairo" }) : "Never"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
