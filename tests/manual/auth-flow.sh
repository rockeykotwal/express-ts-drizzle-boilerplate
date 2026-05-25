#!/usr/bin/env bash
# Auth flow manual test cheatsheet
# Make executable: chmod +x tests/manual/auth-flow.sh
# Run: ./tests/manual/auth-flow.sh

BASE_URL=http://localhost:3000

# ─────────────────────────────────────────────────────────────────────────────
# 1. Signup with valid data
#    Expected: 201 Created — returns user, accessToken, refreshToken
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 1. Signup valid"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName":  "Doe",
    "email":     "jane@example.com",
    "password":  "securePass1"
  }'
echo

# ─────────────────────────────────────────────────────────────────────────────
# 2. Signup with the same email again
#    Expected: 409 Conflict — "Email already in use"
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 2. Signup duplicate email"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName":  "Doe",
    "email":     "jane@example.com",
    "password":  "securePass1"
  }'
echo

# ─────────────────────────────────────────────────────────────────────────────
# 3. Signup with invalid email format
#    Expected: 400 Bad Request — validation error on email field
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 3. Signup invalid email format"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName":  "Doe",
    "email":     "not-an-email",
    "password":  "securePass1"
  }'
echo

# ─────────────────────────────────────────────────────────────────────────────
# 4. Signup with password under 8 characters
#    Expected: 400 Bad Request — validation error on password field
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 4. Signup short password"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName":  "Doe",
    "email":     "short@example.com",
    "password":  "abc123"
  }'
echo

# ─────────────────────────────────────────────────────────────────────────────
# 5. Login with correct credentials
#    Expected: 200 OK — captures ACCESS_TOKEN and REFRESH_TOKEN for later steps
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 5. Login valid credentials"
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email":    "jane@example.com",
    "password": "securePass1"
  }')

echo "$LOGIN_RESPONSE"
echo "HTTP $(echo "$LOGIN_RESPONSE" | grep -o '"accessToken"' | head -1 | wc -l | tr -d ' ' | awk '{if($1>0) print "200 (tokens found)"; else print "unexpected"}')"

ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | sed 's/.*"accessToken":"\([^"]*\)".*/\1/')
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | sed 's/.*"refreshToken":"\([^"]*\)".*/\1/')

echo "ACCESS_TOKEN captured: ${ACCESS_TOKEN:0:40}..."
echo "REFRESH_TOKEN captured: ${REFRESH_TOKEN:0:40}..."
echo

# ─────────────────────────────────────────────────────────────────────────────
# 6. Login with wrong password
#    Expected: 401 Unauthorized — "Invalid credentials"
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 6. Login wrong password"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email":    "jane@example.com",
    "password": "wrongpassword"
  }'
echo

# ─────────────────────────────────────────────────────────────────────────────
# 7. Login with non-existent email
#    Expected: 401 Unauthorized — "Invalid credentials"
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 7. Login non-existent email"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email":    "ghost@example.com",
    "password": "securePass1"
  }'
echo

# ─────────────────────────────────────────────────────────────────────────────
# 8. GET /api/users/me with valid access token
#    Expected: 200 OK — returns the authenticated user's profile
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 8. GET /api/users/me with valid token"
curl -s -w "\nHTTP %{http_code}\n" -X GET "$BASE_URL/api/users/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 9. GET /api/users/me without any token
#    Expected: 401 Unauthorized — missing Authorization header
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 9. GET /api/users/me without token"
curl -s -w "\nHTTP %{http_code}\n" -X GET "$BASE_URL/api/users/me"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 10. GET /api/users/me with a malformed token
#     Expected: 401 Unauthorized — token verification fails
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 10. GET /api/users/me with malformed token"
curl -s -w "\nHTTP %{http_code}\n" -X GET "$BASE_URL/api/users/me" \
  -H "Authorization: Bearer this.is.not.a.valid.jwt"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 11. Refresh access token using the refresh token from step 5
#     Expected: 200 OK — returns a new accessToken; captured as NEW_ACCESS_TOKEN
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 11. Refresh access token"
REFRESH_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}")

echo "$REFRESH_RESPONSE"
NEW_ACCESS_TOKEN=$(echo "$REFRESH_RESPONSE" | sed 's/.*"accessToken":"\([^"]*\)".*/\1/')
echo "NEW_ACCESS_TOKEN captured: ${NEW_ACCESS_TOKEN:0:40}..."
echo

# ─────────────────────────────────────────────────────────────────────────────
# 12. Logout using the new access token
#     Expected: 200 OK — refresh token is revoked in Redis
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 12. Logout"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE_URL/api/auth/logout" \
  -H "Authorization: Bearer $NEW_ACCESS_TOKEN"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 13. Try to refresh again after logout (token is revoked)
#     Expected: 401 Unauthorized — "Refresh token revoked"
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 13. Refresh after logout (revoked token)"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE_URL/api/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 14. GET /api/users with a valid (new) access token
#     Expected: 200 OK — returns array of users
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 14. GET /api/users with valid token"
curl -s -w "\nHTTP %{http_code}\n" -X GET "$BASE_URL/api/users" \
  -H "Authorization: Bearer $NEW_ACCESS_TOKEN"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 15. GET /api/users without any token
#     Expected: 401 Unauthorized — authenticate middleware blocks the request
# ─────────────────────────────────────────────────────────────────────────────
echo "==> 15. GET /api/users without token"
curl -s -w "\nHTTP %{http_code}\n" -X GET "$BASE_URL/api/users"
echo
