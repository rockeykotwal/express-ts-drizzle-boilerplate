#!/usr/bin/env bash
# RBAC flow manual test cheatsheet
# Make executable: chmod +x tests/manual/rbac-flow.sh
# Run:             ./tests/manual/rbac-flow.sh
#
# ─── USAGE ────────────────────────────────────────────────────────────────────
# 1. Ensure your .env is configured and the database is running.
# 2. Run the RBAC seed first:
#      npm run db:seed:rbac
#    This creates the default roles (guest, user, moderator, admin)
#    and their associated permissions.
#
# 3. Getting an ADMIN_TOKEN:
#    After signing up as an admin user (step 2 below), the account starts
#    with NO roles. You must manually assign the 'admin' role via:
#      a) psql / DB client: INSERT INTO user_roles (user_id, role_id) ...
#         Use the IDs printed by the seed or from SELECT * FROM roles;
#      b) Or add a one-time script that calls RbacService.assignRoleToUser()
#    Once the admin role is assigned, log in again to get a fresh ADMIN_TOKEN
#    whose permissions include '*' (all access).
# ──────────────────────────────────────────────────────────────────────────────

BASE_URL=http://localhost:3000

# ─────────────────────────────────────────────────────────────────────────────
# 1. Signup as a regular user
#    Expected: 201 Created — captures USER_TOKEN and USER_ID
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 1. Signup regular user"
USER_SIGNUP=$(curl -s -X POST "$BASE_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Regular",
    "lastName":  "User",
    "email":     "regular@example.com",
    "password":  "regularPass1"
  }')

echo "$USER_SIGNUP"
USER_TOKEN=$(echo "$USER_SIGNUP" | sed 's/.*"accessToken":"\([^"]*\)".*/\1/')
USER_ID=$(echo "$USER_SIGNUP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "USER_TOKEN captured: ${USER_TOKEN:0:40}..."
echo "USER_ID captured:    $USER_ID"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 2. Signup as an admin user
#    Expected: 201 Created — captures ADMIN_TOKEN and ADMIN_USER_ID
#
#    NOTE: This account starts with NO roles. You must manually assign
#    the 'admin' role in the DB before ADMIN_TOKEN will have full access.
#    After assigning the role, run step 5 (Login) separately and refresh
#    ADMIN_TOKEN. See USAGE section at the top for instructions.
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 2. Signup admin user (role must be assigned manually after this step)"
ADMIN_SIGNUP=$(curl -s -X POST "$BASE_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Admin",
    "lastName":  "User",
    "email":     "admin@example.com",
    "password":  "adminPass1!"
  }')

echo "$ADMIN_SIGNUP"
ADMIN_TOKEN=$(echo "$ADMIN_SIGNUP" | sed 's/.*"accessToken":"\([^"]*\)".*/\1/')
ADMIN_USER_ID=$(echo "$ADMIN_SIGNUP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "ADMIN_TOKEN captured:    ${ADMIN_TOKEN:0:40}..."
echo "ADMIN_USER_ID captured:  $ADMIN_USER_ID"
echo
echo "  *** Assign admin role to ADMIN_USER_ID in the DB, then re-login to get a fresh token ***"
echo

# ─────────────────────────────────────────────────────────────────────────────
# (Re-login to get a fresh ADMIN_TOKEN after role has been assigned)
# Uncomment and run this block once the admin role is assigned in the DB:
#
# echo "==> Re-login as admin (after role assigned)"
# ADMIN_LOGIN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
#   -H "Content-Type: application/json" \
#   -d '{ "email": "admin@example.com", "password": "adminPass1!" }')
# echo "$ADMIN_LOGIN"
# ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | sed 's/.*"accessToken":"\([^"]*\)".*/\1/')
# echo "ADMIN_TOKEN refreshed: ${ADMIN_TOKEN:0:40}..."
# echo
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# 3. GET /api/users with USER_TOKEN (no users:read permission yet)
#    Expected: 403 Forbidden
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 3. GET /api/users with USER_TOKEN (no permission yet)"
curl -s -w "\nHTTP %{http_code}\n" -X GET "$BASE_URL/api/users" \
  -H "Authorization: Bearer $USER_TOKEN"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 4. GET /api/users with ADMIN_TOKEN (admin has '*' permission)
#    Expected: 200 OK
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 4. GET /api/users with ADMIN_TOKEN"
curl -s -w "\nHTTP %{http_code}\n" -X GET "$BASE_URL/api/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 5. GET /api/users without any token
#    Expected: 401 Unauthorized
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 5. GET /api/users without token"
curl -s -w "\nHTTP %{http_code}\n" -X GET "$BASE_URL/api/users"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 6. GET /api/roles with ADMIN_TOKEN
#    Expected: 200 OK — lists seeded roles (guest, user, moderator, admin)
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 6. GET /api/roles with ADMIN_TOKEN"
curl -s -w "\nHTTP %{http_code}\n" -X GET "$BASE_URL/api/roles" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 7. GET /api/roles with USER_TOKEN (no roles:manage permission)
#    Expected: 403 Forbidden
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 7. GET /api/roles with USER_TOKEN (no permission)"
curl -s -w "\nHTTP %{http_code}\n" -X GET "$BASE_URL/api/roles" \
  -H "Authorization: Bearer $USER_TOKEN"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 8. POST /api/roles with ADMIN_TOKEN — create 'editor' role
#    Expected: 201 Created — captures ROLE_ID
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 8. POST /api/roles — create 'editor' role (admin)"
CREATE_ROLE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/roles" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{ "name": "editor", "description": "Can read and write user data" }')

echo "$CREATE_ROLE_RESPONSE"
ROLE_ID=$(echo "$CREATE_ROLE_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "ROLE_ID captured: $ROLE_ID"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 9. POST /api/roles with USER_TOKEN (no roles:manage permission)
#    Expected: 403 Forbidden
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 9. POST /api/roles with USER_TOKEN (no permission)"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE_URL/api/roles" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d '{ "name": "should-fail" }'
echo

# ─────────────────────────────────────────────────────────────────────────────
# 10. GET /api/permissions with ADMIN_TOKEN
#     Expected: 200 OK — review output to find users:read permission ID
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 10. GET /api/permissions (admin)"
PERM_LIST_RESPONSE=$(curl -s -X GET "$BASE_URL/api/permissions" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

echo "$PERM_LIST_RESPONSE"
echo

# Attempt to extract the users:read permission ID automatically.
# If this fails, manually set USERS_READ_PERM_ID from the output above.
USERS_READ_PERM_ID=$(echo "$PERM_LIST_RESPONSE" | grep -o '"id":"[^"]*","action":"read","resource":"users"' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
if [ -z "$USERS_READ_PERM_ID" ]; then
  echo "  Could not auto-extract users:read ID — set manually:"
  echo "  USERS_READ_PERM_ID=\"<paste-id-here>\""
else
  echo "USERS_READ_PERM_ID captured: $USERS_READ_PERM_ID"
fi
echo

# ─────────────────────────────────────────────────────────────────────────────
# 11. POST /api/permissions — create a custom permission
#     Expected: 201 Created — captures PERMISSION_ID
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 11. POST /api/permissions — create custom permission"
CREATE_PERM_RESPONSE=$(curl -s -X POST "$BASE_URL/api/permissions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "action":      "publish",
    "resource":    "posts",
    "key":         "posts:publish",
    "description": "Publish posts"
  }')

echo "$CREATE_PERM_RESPONSE"
PERMISSION_ID=$(echo "$CREATE_PERM_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "PERMISSION_ID captured: $PERMISSION_ID"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 12. POST /api/roles/:ROLE_ID/permissions — assign users:read to editor role
#     Expected: 200 OK — { message: 'Permission assigned' }
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 12. Assign users:read permission to editor role"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE_URL/api/roles/$ROLE_ID/permissions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d "{\"permissionId\": \"$USERS_READ_PERM_ID\"}"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 13. POST /api/users/:userId/roles — assign editor role to regular user
#     Expected: 200 OK — { message: 'Role assigned' }
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 13. Assign editor role to regular user"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE_URL/api/users/$USER_ID/roles" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d "{\"roleId\": \"$ROLE_ID\"}"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 14. GET /api/users with USER_TOKEN — user now has users:read via editor role
#     Expected: 200 OK (permission cache populated after role assignment)
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 14. GET /api/users with USER_TOKEN (should now have users:read)"
curl -s -w "\nHTTP %{http_code}\n" -X GET "$BASE_URL/api/users" \
  -H "Authorization: Bearer $USER_TOKEN"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 15. DELETE /api/users/:userId/roles/:ROLE_ID — remove editor role from user
#     Expected: 204 No Content — Redis cache invalidated immediately
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 15. Remove editor role from regular user"
curl -s -w "\nHTTP %{http_code}\n" -X DELETE "$BASE_URL/api/users/$USER_ID/roles/$ROLE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 16. GET /api/users with USER_TOKEN — role removed, cache cleared
#     Expected: 403 Forbidden again
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 16. GET /api/users with USER_TOKEN after role removed"
curl -s -w "\nHTTP %{http_code}\n" -X GET "$BASE_URL/api/users" \
  -H "Authorization: Bearer $USER_TOKEN"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 17. DELETE /api/roles/:ROLE_ID — delete the editor role
#     Expected: 204 No Content
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 17. Delete editor role"
curl -s -w "\nHTTP %{http_code}\n" -X DELETE "$BASE_URL/api/roles/$ROLE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
echo
