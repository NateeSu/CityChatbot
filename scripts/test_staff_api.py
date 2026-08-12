"""Static contract checks for tenant staff, role and invitation management."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ADMIN = ROOT / "apps" / "web" / "app" / "api" / "v1" / "admin"
STAFF = ADMIN / "staff"
DOMAIN = ROOT / "packages" / "user-management" / "src" / "user-management.ts"
MIGRATION = ROOT / "supabase" / "migrations" / "20260811190000_staff_management_schema.sql"


class StaffManagementContractTests(unittest.TestCase):
    def test_canonical_routes_are_explicit_and_fail_closed(self) -> None:
        routes = (
            STAFF / "route.ts",
            STAFF / "invitations" / "route.ts",
            STAFF / "invitations" / "[id]" / "revoke" / "route.ts",
            STAFF / "invitations" / "[id]" / "accept" / "route.ts",
            STAFF / "[membershipId]" / "route.ts",
            STAFF / "[membershipId]" / "role-assignments" / "route.ts",
            STAFF / "[membershipId]" / "role-assignments" / "[roleId]" / "route.ts",
            ADMIN / "roles" / "route.ts",
            ADMIN / "roles" / "[id]" / "route.ts",
        )
        for route in routes:
            source = route.read_text(encoding="utf-8")
            self.assertIn("CONFIGURATION_UNAVAILABLE", source, route.as_posix())
            self.assertIn("local", source.lower(), route.as_posix())
        self.assertNotIn("[...", "\n".join(path.as_posix() for path in STAFF.rglob("route.ts")))

    def test_domain_closes_token_replay_step_up_last_admin_and_pii_controls(self) -> None:
        source = DOMAIN.read_text(encoding="utf-8")
        for marker in ("InvitationStatus", "PENDING", "ACCEPTED", "EXPIRED", "REVOKED", "hashToken", "emailDigest", "maskEmail", "INVITATION_REPLAYED", "INVITATION_EXPIRED", "LAST_ADMIN_GUARD", "sessionRevokedAt", "MAX_ASSIGNED_ROLES", "mfaVerified", "reauthenticatedAt"):
            self.assertIn(marker, source)
        self.assertIsNone(re.search(r"OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE|sk-or-", source, re.IGNORECASE))
        self.assertNotIn("authSubject: email", source)

    def test_schema_has_composite_tenant_fks_forced_rls_and_server_only_functions(self) -> None:
        source = MIGRATION.read_text(encoding="utf-8")
        for marker in ("staff_invitations", "staff_invitation_roles", "staff_invitation_departments", "staff_invitations_membership_fk", "staff_invitation_roles_role_fk", "staff_invitation_departments_department_fk", "staff_invitation_immutability", "tenant_memberships_last_admin_guard", "membership_roles_last_admin_guard", "private.accept_staff_invitation", "private.deactivate_staff_membership"):
            self.assertIn(marker, source)
        for table in ("staff_invitations", "staff_invitation_roles", "staff_invitation_departments"):
            self.assertIn(f"alter table public.{table} force row level security", source)
            self.assertIn(f"revoke all on table public.{table} from anon, authenticated", source)
        self.assertIn("token_digest", source)
        self.assertIn("raw invitation secrets", source)

    def test_admin_a75_ui_masks_pii_and_covers_resilient_states(self) -> None:
        page = (ROOT / "apps" / "web" / "app" / "admin" / "staff" / "page.tsx").read_text(encoding="utf-8")
        console = (ROOT / "apps" / "web" / "app" / "admin" / "staff" / "StaffConsole.tsx").read_text(encoding="utf-8")
        css = (ROOT / "apps" / "web" / "app" / "admin" / "staff" / "staff.css").read_text(encoding="utf-8")
        for marker in ("PermissionDeniedState", "FeatureDisabledState", "query.role", "StaffConsole"):
            self.assertIn(marker, page)
        for marker in ("A-75", "emailMasked", "inviteToken", "ExpiredSessionState", "OfflineState", "StaleState", "EmptyState", "LoadingState", "last-admin guard", "sessionRevokedAt"):
            self.assertIn(marker, console)
        for breakpoint in ("max-width: 1023px", "max-width: 767px", "max-width: 480px", "max-width: 320px"):
            self.assertIn(breakpoint, css)


if __name__ == "__main__":
    unittest.main(verbosity=2)
